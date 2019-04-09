const _ = require('lodash');
const namedEventEmitters = {};

const convertWildcardToRegex = wildcardString => new RegExp(`^${wildcardString.replace(/\*/g, '.*')}$`, 'g');

const wildcardEventMatcher = (leftValue, rightValue) => {
    if (leftValue === '*' || rightValue === '*') {
        return true;
    }
    if (leftValue === rightValue) {
        return true;
    }
    return convertWildcardToRegex(leftValue).test(rightValue) || convertWildcardToRegex(rightValue).test(leftValue);
};

const checkListOptions = (options, value) => {
    return options.some(option => option === value);
};

const getListOptions = string => {
    if (string.startsWith('{') && string.endsWith('}')) {
        return string.substr(1).slice(0, -1).split(',');
    }
    return [];
};

const listOptionEventMatcher = (leftValue, rightValue) => {
    if (leftValue === rightValue) {
        return true;
    }
    return checkListOptions(getListOptions(leftValue), rightValue) || checkListOptions(getListOptions(rightValue), leftValue);
};

const sectionFilter = _.curry((sectionMatchers, lhs, rhs) => {
    const leftSections = lhs.split('.');
    const rightSections = rhs.split('.');
    if (leftSections.length !== rightSections.length) {
        return false;
    }
    return leftSections.every((eventSection, index) => {
        return sectionMatchers.some(sectionMatcher => sectionMatcher(leftSections[index], rightSections[index]));
    });
});

const getHandlers = {
    advanced: _.curry((data, filter, matchEvent) => {
        return Object.entries(data.events)
            .filter(([event]) => filter(matchEvent, event))
            .map(([__event, handlers]) => handlers)
            .reduce((allHandlers, handlers) => allHandlers.concat(handlers), []);
    }),
    exact: _.curry((data, matchEvent) => {
        return data.events[matchEvent] || [];
    })
};

const eventRegistrars = {
    basic: _.curry((data, event, handler) => {
        if (!data.events[event]) {
            data.events[event] = [];
        }
        data.events[event].push(handler);
    })
};

const eventEmitter = ({ getHandlers, registerEventHandler }) => {
    const getEventObject = eventName => {
        const meta = {
            action: 'continue'
        };
        return {
            meta,
            handlers: getHandlers(eventName),
            eventObject: Object.freeze({
                eventName,
                continueWithUndefined: Symbol('continue-with-undefined'),
                returnUndefined: Symbol('return-undefined'),
                preventDefault: () => meta.action = 'return'
            })
        };
    };

    /**
     * Emit an event synchronously. This emit will execute all matching handlers and return an array of their return values.
     *
     * @function
     * @name EventEmitter#emit
     * @param {string} event The name of the event to emit (use full-stop '.' as a namespace delimiter).
     * @param {...*} [args] Any number of arguments to pass to all event handlers.
     * @returns {array} An array of all the values returned by event handlers in the order they were executed.
     */
    const emit = (event, ...args) => {
        const { handlers, eventObject } = getEventObject(event);
        return handlers.map(handler => handler(eventObject, ...args));
    };

    /**
     * Emit an event asynchronously. This emit will execute all matching handlers concurrently (in parallel) and return an
     * array of their return values.
     *
     * @function
     * @name EventEmitter#emitAsync
     * @param {string} event The name of the event to emit (use full-stop '.' as a namespace delimiter).
     * @param {...*} [args] Any number of arguments to pass to all event handlers.
     * @returns {Promise<array>} A Promise that will resolve to an array of all the values returned by the event handlers in the order they were matched.
     */
    const emitAsync = async (event, ...args) => {
        const { handlers, eventObject } = getEventObject(event);
        return await Promise.all(handlers.map(async (handler) => await handler(eventObject, ...args)));
    };

    const updateWaterfallMetaData = ({ meta, eventObject }) => {
        switch (meta.lastResult) {
        case eventObject.continueWithUndefined:
            meta.nextInput = [];
            return;
        case eventObject.returnUndefined:
            meta.action = 'return';
            meta.result = undefined;
            return;
        case undefined:
            return;
        default:
            meta.result = meta.lastResult;
            meta.nextInput = [meta.result];
        }
    };

    /**
     * Emit an event synchronously and in order where the output of each handler in the chain becomes the input to the next.
     * The exception to this rule is that returning undefined from a handler will be interpreted as "leave the data unchanged".
     * If the intention of a handler is to continue execution, but replace the data of previous steps with undefined, return "event.continueWithUndefined" instead
     * of simply returning undefined. If the intention is to halt execution of subsequent steps and return undefined overall, return "event.returnUndefined"
     * where "event" is the first parameter passed to each handler.
     *
     * @function
     * @name EventEmitter#emitWaterfall
     * @param {string} event The name of the event to emit (use full-stop '.' as a namespace delimiter).
     * @param {...*} [args] Any number of arguments to pass to the first event handler.
     * @returns The return value of the last event handler that executed and returned a value.
     */
    const emitWaterfall = (event, ...args) => {
        const { handlers, eventObject, meta } = getEventObject(event);
        meta.nextInput = args;
        for (const handler of handlers) {
            meta.lastResult = handler(eventObject, ...meta.nextInput);
            updateWaterfallMetaData({ meta, eventObject });
            if (meta.action === 'return') {
                break;
            }
        }
        return meta.result;
    };

    /**
     * An asynchronous version of {@link EventEmitter#emitWaterfall}
     *
     * @function
     * @name EventEmitter#emitWaterfallAsync
     * @see {EventEmitter#emitWaterfall}
     * @param {string} event The name of the event to emit (use full-stop '.' as a namespace delimiter).
     * @param {...*} [args] Any number of arguments to pass to the first event handler.
     * @returns The return value of the last event handler that executed and returned a value.
     */
    const emitWaterfallAsync = async (event, ...args) => {
        const { handlers, eventObject, meta } = getEventObject(event);
        meta.nextInput = args;
        for (const handler of handlers) {
            meta.lastResult = await handler(eventObject, ...meta.nextInput);
            updateWaterfallMetaData({ meta, eventObject });
            if (meta.action === 'return') {
                break;
            }
        }
        return meta.result;
    };

    /**
     * Register an event handler. The event handler will be called when any event matching the event string is emitted. The order of execution and parameters
     * passed to the handler can change based on which emit was used. {@link EventEmitter#emit} {@link EventEmitter#emitWaterfall}.
     *
     * @function
     * @name EventEmitter#on
     * @param {string} event The name (or matching string) of the event you want the handler to be registered against.
     * @param {function} handler The event handler to register.
     */

    /**
     * @classdesc The main aggregating event emitter object.
     *
     * @class
     * @hideconstructor
     * @name EventEmitter
     */
    return {
        emit,
        emitAsync,
        emitWaterfall,
        emitWaterfallAsync,
        on: registerEventHandler
    };
};

/**
 * The options that can set on an event emitter when it is created.
 *
 * @typedef options
 * @type {object}
 * @property {boolean} [wildcards=false] Whether or not to enable wildcard matching in event names (e.g., "data.*" to match "data.get").
 * @property {boolean} [listOptions=false] Whether or not to enable list option matching in event names. (e.g., "data.{get,set}" to match both "data.get" and "data.set").
 * @property {boolean|array} [hooks=false] <p>False to disable hooks, or an array to specify lifecycle hooks (in order) to allow handlers to register against.
 *     E.g., if passing in ['first', 'before', 'default' 'after', 'last'] any handler registered as "namespace.event" will be in the "default" lifecycle, which will happen
 *     after those registered as "first:namespace.event" or "before:namespace.event".</p><p>If a "default" is not provided, an error will be raised if any handler is registered
 *     without a lifecycle marker. If the value true is provided instead of an array, the default lifecycles will be used (["early", "before", "default", "after", "late"]).</p><p>NOT YET IMPLEMENTED</p>
 */
const configureEventEmitter = ({ wildcards = false, listOptions = false }) => {
    const data = {
        cache: {},
        events: {}
    };

    const options = {
        getHandlers: getHandlers.exact(data),
        registerEventHandler: eventRegistrars.basic(data)
    };
    const sectionMatchers = [];
    if (wildcards) {
        sectionMatchers.push(wildcardEventMatcher);
    }
    if (listOptions) {
        sectionMatchers.push(listOptionEventMatcher);
    }

    if (sectionMatchers.length > 0) {
        options.getHandlers = getHandlers.advanced(data, sectionFilter(sectionMatchers));
    }
    return eventEmitter(options);
};

/**
 * Find an existing event emitter by name or create a new one. Named event emitters will always return the first instance
 * created when fetched by name unless they've been specifically deleted using the {@link removeNamedEventEmitter} or
 * {@link removeNamedEventEmitters} functions. If no name is provided, an anonymous event emitter that cannot be fetched
 * again will be created.
 *
 * @param {options} [options] The options to set for the event emitter (ignored if an event emitter by that name already exists).
 * @param {string} [options.name] The name of the event emitter to get or create.
 * @returns {EventEmitter} The event emitter associated with the name provided (or an anonymous one if a name is not provided).
 */
const aggregatingEventEmitter = ({ name, ...options } = {}) => {
    const eventEmitter = namedEventEmitters[name] || configureEventEmitter({ ...options });
    if (name) {
        namedEventEmitters[name] = eventEmitter;
    }
    return eventEmitter;
};

/**
 * Remove an existing event emitter by name. This will not stop the event emitter from functioning, only from being
 * returned from {@link aggregatingEventEmitter}.
 *
 * @param {string} name The name of the event emitter to remove the reference to.
 * @returns {boolean} True if the event emitter existed (and was removed), false otherwise.
 */
const removeNamedEventEmitter = (name) => {
    if (namedEventEmitters[name] === undefined) {
        return false;
    }
    delete namedEventEmitters[name];
    return true;
};

/**
 * Remove all existing event emitters. This will not stop the event emitters from functioning, only from being
 * returned from {@link aggregatingEventEmitter}.
 */
const removeNamedEventEmitters = () => {
    Object.keys(namedEventEmitters).forEach(key => delete namedEventEmitters[key]);
};

/**
 * @see {@link aggregatingEventEmitter}
 */
function AggregatingEventEmitter() {
    return aggregatingEventEmitter.apply(null, arguments);
}

module.exports = {
    AggregatingEventEmitter,
    aggregatingEventEmitter,
    removeNamedEventEmitter,
    removeNamedEventEmitters
};
