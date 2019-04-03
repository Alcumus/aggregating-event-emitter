# Aggregating Event Emitter

This is an event emitter that works similar to standard event emitters, but is purpose built to use events for getting
data as well as simply notifying parts of the system of events. This is helpful for invertion-of-control approaches
where you don't necessarily know what will be able to provide your code with the data you need, only that it will
exist at runtime.

In addition to this it has useful features like wildcard matching and list item matching.

### Installation

```sh
npm install aggregating-event-emitter
```

### Usage examples

Getting data returned by event handlers:

```js
// Handler.js
const dataEvents = require('aggregating-event-emitter').aggregatingEventEmitter({ name: 'data', wildcards: true });
const data = {
    namespace: [1, 4, 9, 12]
};
dataEvents.on('*.data.get', (event, query) => {
    if (query.$gt) {
        const name = event.eventName.split('.')[0];
        return (data[name] || []).filter(value => value > query.$gt);
    }
});

// Emitter.js
// We can reference the previously instantiated event emitter by name and don't need to provide other options to it.
const dataEvents = require('aggregating-event-emitter').aggregatingEventEmitter({ name: 'data' });
const data = dataEvents.emit('namespace.data.get', { $gt: 5 });
console.log(data); // [[9, 12]]
```

Waterfall:

```js
const events = require('aggregating-event-emitter').aggregatingEventEmitter();

// These event handlers will be fired in this order and the output of the first will be passed to the input of the second.
events.on('my-event', (event, array) => array.map(value => value + 10));
events.on('my-event', (event, array) => array.map(value => value * 2));

const data = events.emitWaterfall('my-event', [0, 5, 10]);
console.log(data); // [20, 30, 40]
```

Be aware that it's fully possible for one handler to break the data structure for another handler if you are not careful when
using the waterfall functions. In order to mitigate this, it may be worth using hooks to ensure the order is appropriate.

### API

The API can be found [here](out/index.html).
