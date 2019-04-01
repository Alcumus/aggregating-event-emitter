/* globals describe, context, beforeEach, afterEach, it */

const _ = require('lodash');
const expect = require('chai').expect;
const sinon = require('sinon');
const { aggregatingEventEmitter, AggregatingEventEmitter, ...eventEmitter } = require('../src/event-emitter');

describe('Aggregating Event Emitter', () => {
    beforeEach(() => {
        eventEmitter.removeNamedEventEmitters();
    });

    afterEach(() => {
        sinon.restore();
    });

    const register = (handlers, options) => {
        const eventEmitter = aggregatingEventEmitter(options);
        Object.entries(handlers).forEach(([event, handlers]) => {
            if (!_.isArray(handlers)) {
                handlers = [handlers];
            }
            handlers.forEach(handler => eventEmitter.on(event, handler));
        });
        return eventEmitter;
    };

    const getAsEventMap = (array, require) => {
        return array.reduce((events, pattern) => Object.assign(events, {
            [pattern]: require ? sinon.mock(`match:${pattern}`).once() : sinon.mock(`no-match:${pattern}`).never()
        }), {});
    };

    context('instantiation', () => {
        const getEventEmitterTests = (create = aggregatingEventEmitter) => {
            it('should get the same event emitter instance by passing the same name', () => {
                const firstInstance = create({ name: 'test-specific-name' });
                const secondInstance = create({ name: 'test-specific-name' });
                expect(secondInstance).equal(firstInstance).and.not.be.undefined;
            });

            it('should get a new instance when passing a different name', () => {
                const firstInstance = create({ name: 'test-specific-name' });
                const secondInstance = create({ name: 'non-matching-name' });
                expect(secondInstance).to.not.equal(firstInstance).and.not.be.undefined;
            });

            it('should create an event emitter that cannot be fetched when no name is provided', () => {
                const firstInstance = create();
                const secondInstance = create();
                expect(secondInstance).to.not.equal(firstInstance).and.not.be.undefined;
            });
        };

        context('aggregatingEventEmitter', getEventEmitterTests);

        context('new AggregatingEventEmitter', () => {
            getEventEmitterTests((...args) => new AggregatingEventEmitter(...args));
        });
    });

    describe('#removeNamedEventEmitters', () => {
        it('should remove all named event emitters', () => {
            const names = ['taco', 'gir', 'zim', 'dib'];
            const originalEmitters = names.map(name => aggregatingEventEmitter({ name }));

            eventEmitter.removeNamedEventEmitters();

            const newEmitters = names.map(name => aggregatingEventEmitter({ name }));
            const matchingEmitters = newEmitters.filter(emitter => originalEmitters.includes(emitter));

            expect(matchingEmitters).to.deep.equal([]);
        });
    });

    describe('#removeNamedEventEmitter', () => {
        it('should return true if an event emitter was removed', () => {
            aggregatingEventEmitter({ name: 'sol' });
            expect(eventEmitter.removeNamedEventEmitter('sol')).to.equal(true);
        });

        it('should return false if the event emitter did not exist', () => {
            expect(eventEmitter.removeNamedEventEmitter('sol')).to.equal(false);
        });

        it('should remove the event emitter of that name', () => {
            const firstInstance = aggregatingEventEmitter({ name: 'gir' });
            eventEmitter.removeNamedEventEmitter('gir');
            const secondInstance = aggregatingEventEmitter({ name: 'gir' });
            expect(secondInstance).to.not.equal(firstInstance).and.not.be.undefined;
        });
    });

    const testMatchingPatterns = (matchedPatterns, unmatchedPatterns, options, eventName) => {
        ['emit', 'emitAsync', 'emitWaterfall', 'emitWaterfallAsync'].forEach(emitFunction => {
            matchedPatterns.forEach(pattern => {
                it(`#${emitFunction} should call the event handler registered against ${pattern}`, async () => {
                    const events = Object.assign(getAsEventMap(unmatchedPatterns, false), {
                        [pattern]: sinon.mock(`match:${pattern}`).once()
                    });
                    const eventEmitter = register(events, options);

                    await eventEmitter[emitFunction](eventName);
                    sinon.verify();
                });

                it(`#${emitFunction} should call multiple event handlers registered against ${pattern}`, async () => {
                    const events = Object.assign(getAsEventMap(unmatchedPatterns, false), {
                        [pattern]: [sinon.mock(`match:${pattern}`).once(), sinon.mock(`match:${pattern}`).once(), sinon.mock(`match:${pattern}`).once()]
                    });
                    const eventEmitter = register(events, options);

                    await eventEmitter[emitFunction](eventName);
                    sinon.verify();
                });
            });

            it(`#${emitFunction} should call event handlers registered on all events that match`, async () => {
                const events = Object.assign(getAsEventMap(unmatchedPatterns, false), getAsEventMap(matchedPatterns, true));
                const eventEmitter = register(events, options);

                await eventEmitter[emitFunction](eventName);
                sinon.verify();
            });

            it(`#${emitFunction} should pass an event object to every handler that contains the name of the event that caused them to be triggered`, async () => {
                const eventEmitter = register({
                    'event': sinon.mock().once().withExactArgs(sinon.match({ eventName: 'event' })),
                    'second.event': sinon.mock().once().withExactArgs(sinon.match({ eventName: 'second.event' }))
                });

                await eventEmitter[emitFunction]('event');
                await eventEmitter[emitFunction]('second.event');
                sinon.verify();
            });
        });
    };

    const testDefaultDataHandling = (...emitFunctions) => {
        emitFunctions.forEach(emitFunction => {
            it(`#${emitFunction} should return an array of the returned values from each of the matched handlers`, async () => {
                const eventEmitter = register({
                    'event': _.times(5, n => () => `result-${ n }`)
                });
                const expected = _.times(5, n => `result-${ n }`);

                const results = await eventEmitter[emitFunction]('event');
                expect(results).to.deep.equal(expected);
            });

            it(`#${emitFunction} should pass on any arguments passed to the event to every handler`, async () => {
                const args = [1, 2, 3];
                const eventEmitter = register({
                    'event': sinon.mock().once().withExactArgs(sinon.match.any, ...args),
                    'second.event': sinon.mock().once().withExactArgs(sinon.match.any, ...args)
                });

                await eventEmitter[emitFunction]('event', ...args);
                await eventEmitter[emitFunction]('second.event', ...args);
                sinon.verify();
            });
        });
    };

    const testWaterfallDataHandling = (...emitFunctions) => {
        const initialiseAndStubHandlerResults = (...results) => {
            return register({
                event: results.map(result => (() => result))
            });
        };

        emitFunctions.forEach(emitFunction => {
            it(`#${emitFunction} should return the value returned by the last handler in the chain`, async () => {
                const last = Symbol('last');
                const events = initialiseAndStubHandlerResults(Symbol('first'), Symbol('second'), last);
                const result = await events[emitFunction]('event');
                expect(result).to.equal(last);
            });

            it(`#${emitFunction} should pass on all initial arguments to the first handler`, async () => {
                const initialArguments = [Symbol(1), Symbol(2)];
                const events = register({
                    event: [sinon.mock('first-handler').once().withExactArgs(sinon.match.any, ...initialArguments)]
                });
                await events[emitFunction]('event', ...initialArguments);
                sinon.verify();
            });

            it(`#${emitFunction} should pass on the output from the first handler as input to the second handler`, async () => {
                const output = Symbol('output');
                const events = register({
                    event: [sinon.stub().returns(output), sinon.mock().withExactArgs(sinon.match.any, output)]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should pass on the original input to the second handler when the first handler returned undefined`, async () => {
                const initialArguments = [Symbol(1), Symbol(2)];
                const events = register({
                    event: [sinon.stub().returns(undefined), sinon.mock().withExactArgs(sinon.match.any, ...initialArguments)]
                });
                await events[emitFunction]('event', ...initialArguments);
                sinon.verify();
            });

            it(`#${emitFunction} should pass on the output value from the first handler to the third handler when the second handler returned undefined`, async () => {
                const output = Symbol('output');
                const events = register({
                    event: [sinon.stub().returns(output), sinon.stub().returns(undefined), sinon.mock().withExactArgs(sinon.match.any, output)]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should pass on undefined to the second handler when the first handler returned event.continueWithUndefined`, async () => {
                const events = register({
                    event: [event => event.continueWithUndefined, sinon.mock().withExactArgs(sinon.match.any)]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should not call the second handler when the first handler returns event.returnUndefined`, async () => {
                const events = register({
                    event: [event => event.returnUndefined, sinon.mock().never()]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should not call the second handler when the first handler calls event.preventDefault`, async () => {
                const events = register({
                    event: [event => event.preventDefault(), sinon.mock().never()]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should return the previous returned value after a handler that calls event.preventDefault returns undefined`, async () => {
                const expectedResult = Symbol('result');
                const events = register({
                    event: [sinon.stub().returns(expectedResult), event => { event.preventDefault(); return undefined; }, sinon.stub().returns(1)]
                });
                const result = await events[emitFunction]('event', 'args');
                expect(result).to.equal(expectedResult);
            });

            it(`#${emitFunction} should return the value returned by the handler after the handler calls event.preventDefault`, async () => {
                const expectedResult = Symbol('result');
                const events = register({
                    event: [sinon.stub().returns(1), event => { event.preventDefault(); return expectedResult; }, sinon.stub().returns(2)]
                });
                const result = await events[emitFunction]('event', 'args');
                expect(result).to.equal(expectedResult);
            });
        });
    };

    context('data', () => {
        testDefaultDataHandling('emit', 'emitAsync');
        testWaterfallDataHandling('emitWaterfall', 'emitWaterfallAsync');
    });

    context('matching', () => {
        context('wildcard enabled', () => {
            const eventName = 'some.event.name';
            const matchedPatterns = [
                '*.event.name',
                'some.*.name',
                'so*.*.name',
                'some.event.*',
                'some.event.name'
            ];
            const unmatchedPatterns = [
                'some.event.that.does.not.match',
                'some.*.other.event',
                'some.*'
            ];
            const options = { wildcards: true };

            testMatchingPatterns(matchedPatterns, unmatchedPatterns, options, eventName);
        });

        context('wildcard disabled', () => {
            const eventName = 'event.name.with.*things*.that.would.otherwise.be.*wildcards*.*';
            const matchedPatterns = [
                'event.name.with.*things*.that.would.otherwise.be.*wildcards*.*',
            ];
            const unmatchedPatterns = [
                'simple.event',
                'event.name.*.*.*.*.*.*.*.*',
                'event.name.*'
            ];
            const options = { wildcards: false };

            testMatchingPatterns(matchedPatterns, unmatchedPatterns, options, eventName);
        });

        context('list-options enabled', () => {
            const eventName = 'this.event.name';
            const matchedPatterns = [
                'this.event.name',
                '{this,that,some}.event.name'
            ];
            const unmatchedPatterns = [
                'that.event.name',
                '*.event.name',
                'this.*.name'
            ];
            const options = { listOptions: true };

            testMatchingPatterns(matchedPatterns, unmatchedPatterns, options, eventName);
        });

        context('list-options disabled', () => {
            const eventName = 'this.event.name';
            const matchedPatterns = [
                'this.event.name',
            ];
            const unmatchedPatterns = [
                '{this,that,some}.event.name',
                'that.event.name',
                '*.event.name',
                'this.*.name'
            ];
            const options = { listOptions: false };

            testMatchingPatterns(matchedPatterns, unmatchedPatterns, options, eventName);
        });

        context('wildcards AND list-options enabled', () => {
            const eventName = 'this.event.name';
            const matchedPatterns = [
                'this.event.name',
                '{this,that,some}.event.name',
                '*.event.name',
                'this.*.name',
                '*.{event,thing}.*',
                '*.*.*'
            ];
            const unmatchedPatterns = [
                'that.event.name',
                '{this.event,that.event}.name'
            ];
            const options = { wildcards: true, listOptions: true };

            testMatchingPatterns(matchedPatterns, unmatchedPatterns, options, eventName);
        });
    });
});
