/* globals describe, context, beforeEach, it */
const { aggregatingEventEmitter, removeNamedEventEmitters } = require('../src/event-emitter');
const Benchmark = require('benchmark');
const { expect, Assertion } = require('chai');
const _ = require('lodash');
const util = require('util');
const inspect = Symbol.for('nodejs.util.inspect.custom');

Assertion.addMethod('minimumOps', function(minimumOps) {
    const actual = _.isArray(this._obj) ? this._obj : [this._obj];
    const failingTests = actual
        .filter(testResult => testResult.ops < minimumOps)
        .map(test => `${test.name} (${test.ops})`);

    this.assert(
        failingTests.length === 0,
        `expected all test results in ${util.inspect(actual)} to have at least ${minimumOps} operations per second. Failing tests: ${failingTests.join(', ')}`
    );
});

describe('NFR performance tests', function() {
    this.timeout(60000);

    beforeEach(() => {
        removeNamedEventEmitters();
    });

    const runEventEmitterTestSuite = ({ name = 'benchmark', tests = {}, options = {}, eventHandlers = {} }) => {
        const eventEmitter = aggregatingEventEmitter({ name: 'benchmark', ...options });
        Object.entries(eventHandlers).forEach(([event, handlers]) => {
            if (!_.isArray(handlers)) {
                handlers = [handlers];
            }
            handlers.forEach(handler => eventEmitter.on(event, handler));
        });
        const suite = new Benchmark.Suite(name);

        return new Promise((resolve, reject) => {
            Object.entries(tests).forEach(([name, test]) => suite.add(name, () => test(eventEmitter)));

            suite
                .on('complete', resolve)
                .on('error', reject)
                .run({ async: true });
        }).then(event => {
            return event.currentTarget.map(test => ({
                name: test.name,
                ops: Math.floor(1 / test.stats.mean),
                [inspect]: function() {
                    return `{ name: ${this.name}, ops: ${this.ops.toLocaleString()} }`;
                }
            }));
        });
    };

    context('wildcards enabled', () => {
        describe('#emit', () => {
            it('single unmatched handler', () => {
                return runEventEmitterTestSuite({
                    name: 'emit-with-wildcards',
                    tests: {
                        'emit 1 level event': (eventEmitter) => eventEmitter.emit('event'),
                        'emit 1 level wildcard': (eventEmitter) => eventEmitter.emit('ev*'),
                        'emit 2 level event': (eventEmitter) => eventEmitter.emit('event.two'),
                        'emit 2 level wildcard': (eventEmitter) => eventEmitter.emit('*.event'),
                        'emit 3 level event': (eventEmitter) => eventEmitter.emit('event.with.more'),
                        'emit 3 level wildcard': (eventEmitter) => eventEmitter.emit('event.*.more')
                    }
                })
                    .then(tests => {
                        const million = 1e6;
                        expect(tests).to.have.minimumOps(2 * million);
                    });
            });
        });
    });
});
