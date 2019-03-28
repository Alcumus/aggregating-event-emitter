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
    const emit = (event, ...args) => {
        const handlers = getHandlers(event);
        return handlers.map(handler => handler(...args));
    };

    const emitAsync = async (event, ...args) => {
        const handlers = getHandlers(event);
        return await Promise.all(handlers.map(async (handler) => await handler(...args)));
    };

    return {
        emit,
        emitAsync,
        on: registerEventHandler
    };
};

const configureEventEmitter = ({ wildcards = false, listOptions = false, hooks = false }) => {
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

const aggregatingEventEmitter = ({ name, ...options } = {}) => {
    const eventEmitter = namedEventEmitters[name] || configureEventEmitter({ ...options });
    if (name) {
        namedEventEmitters[name] = eventEmitter;
    }
    return eventEmitter;
};

const removeNamedEventEmitter = (name) => {
    if (namedEventEmitters[name] === undefined) {
        return false;
    }
    delete namedEventEmitters[name];
    return true;
};

const removeNamedEventEmitters = () => {
    Object.keys(namedEventEmitters).forEach(key => delete namedEventEmitters[key]);
};

function AggregatingEventEmitter() {
    return aggregatingEventEmitter.apply(null, arguments);
}

module.exports = {
    AggregatingEventEmitter,
    aggregatingEventEmitter,
    removeNamedEventEmitter,
    removeNamedEventEmitters
};
