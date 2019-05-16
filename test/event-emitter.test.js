/* globals describe, context, beforeEach, afterEach, it */

const _ = require('lodash');
const expect = require('chai').expect;
const sinon = require('sinon');
const assert = require('assert');
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

                it(`#${emitFunction} should respect unregistering of individual event handlers against ${pattern}`, async () => {
                    const eventHandlers = [
                        sinon.mock(`match:${pattern}`).once(),
                        sinon.mock(`unregistered:${pattern}`).never(),
                        sinon.mock(`match:${pattern}`).once()
                    ];
                    const eventEmitter = register({ [pattern]: eventHandlers });
                    eventEmitter.off(pattern, eventHandlers[1]);
                    await eventEmitter[emitFunction](pattern);
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
                    'event': sinon.mock('event-handler').once().withExactArgs(sinon.match({ eventName: 'event' })),
                    'second.event': sinon.mock('second.event-handler').once().withExactArgs(sinon.match({ eventName: 'second.event' }))
                });

                await eventEmitter[emitFunction]('event');
                await eventEmitter[emitFunction]('second.event');
                sinon.verify();
            });

            it(`#${emitFunction} should respect unregistering of all event handlers`, async () => {
                const events = [
                    sinon.mock('unregistered-event-handler').never(),
                    sinon.mock('second-unregistered-event-handler').never()
                ];
                const eventEmitter = register({ events });
                eventEmitter.off('events');
                await eventEmitter[emitFunction]('events');
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
                    'event': sinon.mock('event-handler').once().withExactArgs(sinon.match.any, ...args),
                    'second.event': sinon.mock('second.event-handler').once().withExactArgs(sinon.match.any, ...args)
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
                    event: [() => output, sinon.mock('input-confirmation-handler').withExactArgs(sinon.match.any, output)]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should pass on the original input to the second handler when the first handler returned undefined`, async () => {
                const initialArguments = [Symbol(1), Symbol(2)];
                const events = register({
                    event: [() => undefined, sinon.mock('input-confirmation-handler').withExactArgs(sinon.match.any, ...initialArguments)]
                });
                await events[emitFunction]('event', ...initialArguments);
                sinon.verify();
            });

            it(`#${emitFunction} should pass on the output value from the first handler to the third handler when the second handler returned undefined`, async () => {
                const output = Symbol('output');
                const events = register({
                    event: [() => output, () => undefined, sinon.mock('input-confirmation-handler').withExactArgs(sinon.match.any, output)]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should pass on undefined to the second handler when the first handler returned event.continueWithUndefined`, async () => {
                const events = register({
                    event: [event => event.continueWithUndefined, sinon.mock('input-confirmation-handler').withExactArgs(sinon.match.any)]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should not call the second handler when the first handler returns event.returnUndefined`, async () => {
                const events = register({
                    event: [event => event.returnUndefined, sinon.mock('skipped-handler').never()]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should not call the second handler when the first handler calls event.preventDefault`, async () => {
                const events = register({
                    event: [event => event.preventDefault(), sinon.mock('skipped-handler').never()]
                });
                await events[emitFunction]('event', 'args');
                sinon.verify();
            });

            it(`#${emitFunction} should return the previous returned value after a handler that calls event.preventDefault returns undefined`, async () => {
                const expectedResult = Symbol('result');
                const events = register({
                    event: [() => expectedResult, event => { event.preventDefault(); return undefined; }, () => 1]
                });
                const result = await events[emitFunction]('event', 'args');
                expect(result).to.equal(expectedResult);
            });

            it(`#${emitFunction} should return the value returned by the handler after the handler calls event.preventDefault`, async () => {
                const expectedResult = Symbol('result');
                const events = register({
                    event: [() => 1, event => { event.preventDefault(); return expectedResult; }, () => 2]
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
                'event.name.with.*things*.that.would.otherwise.be.*wildcards*.*'
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
                'this.event.name'
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

        context('lifecycles enabled', () => {
            const eventName = 'event.name';
            const matchedPatterns = [
                'early:event.name',
                'before:event.name',
                'event.name',
                'after:event.name',
                'late:event.name'
            ];
            const unmatchedPatterns = [
                '*.event.name',
                'before.event.name'
            ];
            const options = { lifecycles: true };

            testMatchingPatterns(matchedPatterns, unmatchedPatterns, options, eventName);
        });

        context('custom lifecycles enabled', () => {
            const eventName = 'event.name';
            const matchedPatterns = [
                'one:event.name',
                'two:event.name',
                'event.name',
                'three:event.name',
                'four:event.name'
            ];
            const unmatchedPatterns = [
                '*.event.name',
                'one.event.name'
            ];
            const options = { lifecycles: ['one', 'two', 'default', 'three', 'four'] };

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

    context('custom lifecycles AND wildcards AND list-options enabled', () => {
        const eventName = 'event.name';
        const matchedPatterns = [
            'one:event.name',
            'two:event.name',
            'event.name',
            'three:event.name',
            'four:event.name',
            'event.*',
            '*.name',
            'one:*.name',
            'three:event.{name,test}'
        ];
        const unmatchedPatterns = [
            '*.event.name',
            'one.event.name'
        ];
        const options = {
            wildcards: true,
            listOptions: true,
            lifecycles: ['one', 'two', 'default', 'three', 'four']
        };

        testMatchingPatterns(matchedPatterns, unmatchedPatterns, options, eventName);
    });

    context('lifecycles', () => {
        describe('#on', () => {
            it('should allow : as part of event name when lifecycles are disabled', () => {
                const events = register({
                    'my:event': [sinon.mock('basic-event-handler').once()]
                }, { lifecycles: false });
                events.emit('my:event');
                sinon.verify();
            });

            it('should throw an error if an invalid lifecycle event is used before : in the event name when lifecycles are enabled', () => {
                try {
                    register({
                        'invalid:event': [() => {}]
                    }, { lifecycles: true });
                    assert.fail('Registering event should have failed');
                } catch (error) {
                    expect(error.message).to.include('Unable to register event handler');
                }
            });

            it('should allow the default set of lifecycles if lifecycles is set to true', () => {
                const registeredLifecycles = ['early:', 'before:', '', 'after:', 'late:'];
                const registerHandlers = {};
                registeredLifecycles.forEach(lifecycle => {
                    registerHandlers[`${lifecycle}event`] = [() => {}];
                });
                register(registerHandlers, { lifecycles: true });
            });

            it('should allow the specified set of lifecycles if lifecycles is an array of strings', () => {
                const registeredLifecycles = ['x:', 'y:', 'z:'];
                const registerHandlers = {};
                registeredLifecycles.forEach(lifecycle => {
                    registerHandlers[`${lifecycle}event`] = [() => {}];
                });
                register(registerHandlers, { lifecycles: ['x', 'y', 'z'] });
            });

            it('should allow not specifying a lifecycle if "default" is one of the lifecycle options', () => {
                const registeredLifecycles = ['', 'x:', 'y:', 'z:'];
                const registerHandlers = {};
                registeredLifecycles.forEach(lifecycle => {
                    registerHandlers[`${lifecycle}event`] = [() => {}];
                });
                register(registerHandlers, { lifecycles: ['default', 'x', 'y', 'z'] });
            });

            it('should throw an error if no lifecycle is specified and "default" is not one of the lifecycle options', () => {
                const registeredLifecycles = ['', 'x:', 'y:', 'z:'];
                const registerHandlers = {};
                registeredLifecycles.forEach(lifecycle => {
                    registerHandlers[`${lifecycle}event`] = [() => {}];
                });
                try {
                    register(registerHandlers, { lifecycles: ['x', 'y', 'z'] });
                    assert.fail('Registering event should have failed');
                } catch (error) {
                    expect(error.message).to.include('Unable to register event handler');
                }
            });

            it('should throw an error if there are more than two colons in the event', () => {
                try {
                    register({
                        'before:event:2:error': [() => {}]
                    }, { lifecycles: true });
                    assert.fail('Registering event should have failed');
                } catch (error) {
                    expect(error.message).to.include('Unable to register event handler');
                }
            });

            it('should throw an error if there is more than one colon in the event and the first section is not a lifecycle', () => {
                try {
                    register({
                        'event:2:error': [() => {}]
                    }, { lifecycles: true });
                    assert.fail('Registering event should have failed');
                } catch (error) {
                    expect(error.message).to.include('Unable to register event handler');
                }
            });

            it('should throw an error if the order value in the event name is not an integer', () => {
                try {
                    register({
                        'event:error': [() => {}]
                    }, { lifecycles: true });
                    assert.fail('Registering event should have failed');
                } catch (error) {
                    expect(error.message).to.include('Unable to register event handler');
                }
            });

            it('should sort event handlers by the number provided after the second colon when present', () => {
                const expectedOrder = _.times(5, n => sinon.mock(`handler #${n}`).once());
                const events = register({
                    'event:0': [expectedOrder[2], expectedOrder[3]],
                    'event:-5': [expectedOrder[1]],
                    'event:12': [expectedOrder[4]],
                    'event:-99': [expectedOrder[0]]
                }, { lifecycles: true });
                events.emit('event');
                sinon.verify();
                expect(
                    expectedOrder.every((handler, index) => index > 0 ? handler.calledAfter(expectedOrder[index - 1]) : true),
                    'Handlers called in the wrong order'
                ).to.equal(true);
            });

            it('should treat event handlers with no order value as having 0 as the order value', () => {
                const expectedOrder = _.times(3, n => sinon.mock(`handler #${n}`).once());
                const events = register({
                    event: [expectedOrder[1]],
                    'event:-1': [expectedOrder[0]],
                    'event:1': [expectedOrder[2]]
                }, { lifecycles: true });
                events.emit('event');
                sinon.verify();
                expect(
                    expectedOrder.every((handler, index) => index > 0 ? handler.calledAfter(expectedOrder[index - 1]) : true),
                    'Handlers called in the wrong order'
                ).to.equal(true);
            });

            it('should treat "event:10" as a short form of "default:event:10"', () => {
                const expectedOrder = _.times(3, n => sinon.mock(`handler #${n}`).once());
                const events = register({
                    'event:10': [expectedOrder[1]],
                    'default:event:9': [expectedOrder[0]],
                    'default:event:11': [expectedOrder[2]]
                }, { lifecycles: true });
                events.emit('event');
                sinon.verify();
                expect(
                    expectedOrder.every((handler, index) => index > 0 ? handler.calledAfter(expectedOrder[index - 1]) : true),
                    'Handlers called in the wrong order'
                ).to.equal(true);
            });
        });

        describe('#off', () => {
            it('should remove listener from event when passing both an event and a listener', () => {
                const registerHandlers = {
                    event: [sinon.mock('match').once(), sinon.mock('unregistered').never(), sinon.mock('match').once()]
                };
                const events = register(registerHandlers, { lifecycles: true });
                events.off('event', registerHandlers.event[1]);
                events.emit('event');
                sinon.verify();
            });

            it('should remove all listeners from event default lifecycle when passing only an event name', () => {
                const registerHandlers = {
                    event: [sinon.mock('unregistered').never(), sinon.mock('unregistered').never(), sinon.mock('unregistered').never()]
                };
                const events = register(registerHandlers, { lifecycles: true });
                events.off('event');
                events.emit('event');
                sinon.verify();
            });

            it('should not remove listeners from other events', () => {
                const registerHandlers = {
                    event: [sinon.mock('match:secondEvent').once(), sinon.mock('match:secondEvent').once(), sinon.mock('match:secondEvent').once()]
                };
                registerHandlers.secondEvent = registerHandlers.event;
                const events = register(registerHandlers, { lifecycles: true });
                events.off('event');
                events.emit('event');
                events.emit('secondEvent');
                sinon.verify();
            });

            it('should not remove listeners from other lifecycles', () => {
                const registerHandlers = {
                    event: [
                        sinon.mock('match:before:event').once().withExactArgs(sinon.match({ lifecycles: {} })).returns(1),
                        sinon.mock('match:before:event').once().withExactArgs(sinon.match({ lifecycles: { before: [1] } })).returns(2),
                        sinon.mock('match:before:event').once().withExactArgs(sinon.match({ lifecycles: { before: [1, 2] } })).returns(3)
                    ]
                };
                registerHandlers['before:event'] = registerHandlers.event;
                const events = register(registerHandlers, { lifecycles: true });
                events.off('event');
                events.emit('event');
                sinon.verify();
            });

            it('should remove listener from all lifecycles when passing * as the lifecycle', () => {
                const handlers = [sinon.mock('match:all').exactly(5), sinon.mock('unregistered').never(), sinon.mock('match:all').exactly(5)];
                const registerHandlers = {
                    'early:event': handlers,
                    'before:event': handlers,
                    event: handlers,
                    'after:event': handlers,
                    'late:event': handlers
                };
                const events = register(registerHandlers, { lifecycles: true });
                events.off('*:event', handlers[1]);
                events.emit('event');
                sinon.verify();
            });

            it('should remove all listeners from all lifecycles when passing only an event name with * as the lifecycle', () => {
                const handlers = _.times(3, () => sinon.mock('unregistered').never());
                const registerHandlers = {
                    'early:event': handlers,
                    'before:event': handlers,
                    event: handlers,
                    'after:event': handlers,
                    'late:event': handlers
                };
                const events = register(registerHandlers, { lifecycles: true });
                events.off('*:event');
                events.emit('event');
                sinon.verify();
            });

            it('should still have all listeners in sorted order after removing a listener');
        });

        const commonLifecycleTests = emitFunction => {
            it('should execute all entries in the first lifecycle before those in the second', async () => {
                const first = _.times(3, n => sinon.mock(`handler #${n}`).once());
                const second = _.times(3, n => sinon.mock(`handler #${n}`).once());
                const events = register({
                    'second:event': second,
                    'first:event': first
                }, { lifecycles: ['first', 'second' ]});
                await events[emitFunction]('event');
                sinon.verify();
                expect(
                    second.every((handler) => first.every(firstHandler => handler.calledAfter(firstHandler))),
                    'Handlers called in the wrong order'
                ).to.equal(true);
            });

            it('should execute all entries in the second lifecycle before those in the third', async () => {
                const first = _.times(3, n => sinon.mock(`handler #${n}`).once());
                const second = _.times(3, n => sinon.mock(`handler #${n}`).once());
                const third = _.times(3, n => sinon.mock(`handler #${n}`).once());
                const events = register({
                    'second:event': second,
                    'third:event': third,
                    'first:event': first
                }, { lifecycles: ['first', 'second', 'third' ]});
                await events[emitFunction]('event');
                sinon.verify();
                expect(
                    third.every((handler) => second.every(secondHandler => handler.calledAfter(secondHandler))),
                    'Handlers called in the wrong order'
                ).to.equal(true);
            });

            it('should execute functions in the order they\'ve been added within the same lifecycle', async () => {
                const expectedOrder = _.times(3, n => sinon.mock(`handler #${n}`).once());
                const events = register({
                    'before:event': expectedOrder,
                }, { lifecycles: true });
                await events[emitFunction]('event');
                sinon.verify();
                expect(
                    expectedOrder.every((handler, index) => index > 0 ? handler.calledAfter(expectedOrder[index - 1]) : true),
                    'Handlers called in the wrong order'
                ).to.equal(true);
            });

            it('should return data as an array where each entry is the array of results from event handlers in that lifecycle entry', async () => {
                const events = register({
                    'early:event': [() => -1],
                    'before:event:1': [() => 2],
                    'before:event': [() => 1],
                    'before:event:-1': [() => 0],
                    'event:1': [() => 3],
                    'event': [() => 2],
                    'event:-1': [() => 1],
                    'after:event:1': [() => 4],
                    'after:event': [() => 3],
                    'after:event:-1': [() => 2],
                    'late:event': [() => -1]
                }, { lifecycles: true });
                const result = await events[emitFunction]('event');
                expect(result).to.deep.equal([
                    [-1],
                    [0, 1, 2],
                    [1, 2, 3],
                    [2, 3, 4],
                    [-1]
                ]);
            });

            it('should return an empty array for lifecycles with no handlers', async () => {
                const events = register({
                    'before:event': [() => 1],
                    'after:event': [() => 1],
                }, { lifecycles: true });
                const result = await events[emitFunction]('event');
                expect(result).to.deep.equal([
                    [],
                    [1],
                    [],
                    [1],
                    []
                ]);
            });

            it('should provide access to the results from the previous lifecycle(s) on the event object as event.lifecycles[lifecycle]', async () => {
                const events = register({
                    'before:event': [() => 1, () => 2],
                    event: [sinon.mock('on:event').once().withExactArgs(sinon.match({
                        lifecycles: sinon.match({
                            before: [1, 2]
                        })
                    }))],
                }, { lifecycles: true });
                await events[emitFunction]('event');
                sinon.verify();
            });
        };

        describe('#emit', () => {
            commonLifecycleTests('emit');
        });

        describe('#emitAsync', () => {
            commonLifecycleTests('emitAsync');
        });

        const testWaterfallLifecycles = emitFunction => {
            describe(`#${emitFunction}`, () => {
                it('should execute handlers first by order of lifecycle, then in order within the lifecycles', () => {
                    const expectedOrder = _.times(5, n => sinon.mock(`handler #${n}`).once());
                    const events = register({
                        'first:event:0': [expectedOrder[1], expectedOrder[2]],
                        'first:event:-5': [expectedOrder[0]],
                        'second:event:12': [expectedOrder[4]],
                        'second:event:-99': [expectedOrder[3]]
                    }, { lifecycles: ['first', 'second'] });
                    events.emit('event');
                    sinon.verify();
                    expect(
                        expectedOrder.every((handler, index) => index > 0 ? handler.calledAfter(expectedOrder[index - 1]) : true),
                        'Handlers called in the wrong order'
                    ).to.equal(true);
                });
            });
        };

        describe('#emitWaterfall', () => {
            testWaterfallLifecycles('emitWaterfall');
        });

        describe('#emitWaterfallAsync', () => {
            testWaterfallLifecycles('emitWaterfallAsync');
        });
    });
});
