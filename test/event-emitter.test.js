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
        ['emit', 'emitAsync'].forEach(emitFunction => {
            matchedPatterns.forEach(pattern => {
                it(`#${emitFunction} should call the event handler registered against ${ pattern }`, async () => {
                    const events = Object.assign(getAsEventMap(unmatchedPatterns, false), {
                        [pattern]: sinon.mock(`match:${ pattern }`).once()
                    });
                    const eventEmitter = register(events, options);

                    await eventEmitter[emitFunction](eventName);
                    sinon.verify();
                });

                it(`#${emitFunction} should call multiple event handlers registered against ${ pattern }`, async () => {
                    const events = Object.assign(getAsEventMap(unmatchedPatterns, false), {
                        [pattern]: [sinon.mock(`match:${ pattern }`).once(), sinon.mock(`match:${ pattern }`).once(), sinon.mock(`match:${ pattern }`).once()]
                    });
                    const eventEmitter = register(events, options);

                    await eventEmitter[emitFunction](eventName);
                    sinon.verify();
                });
            });

            it(`#${emitFunction} should call event handlers registered on all events that match with a wildcard`, async () => {
                const events = Object.assign(getAsEventMap(unmatchedPatterns, false), getAsEventMap(matchedPatterns, true));
                const eventEmitter = register(events, options);

                await eventEmitter[emitFunction](eventName);
                sinon.verify();
            });

            it(`#${emitFunction} should return an array of the returned values from each of the matched handlers`, async () => {
                const eventEmitter = register({
                    'event': _.times(5, n => () => `result-${ n }`)
                });
                const expected = _.times(5, n => `result-${ n }`);

                const results = await eventEmitter[emitFunction]('event');
                expect(results).to.deep.equal(expected);
            });
        });
    };

    context('wildcard enabled', () => {
        describe('#emit', () => {
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
    });

    context('wildcard disabled', () => {
        describe('#emit', () => {
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
    });

    context('list-options enabled', () => {
        describe('#emit', () => {
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
    });

    context('list-options disabled', () => {
        describe('#emit', () => {
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
    });

    context('wildcards AND list-options enabled', () => {
        describe('#emit', () => {
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
