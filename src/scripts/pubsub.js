let subscribers = {};

function subscribe(eventName, callback) {
  if (subscribers[eventName] === undefined) {
    subscribers[eventName] = [];
  }

  subscribers[eventName] = [...subscribers[eventName], callback];

  return function unsubscribe() {
    subscribers[eventName] = subscribers[eventName].filter((cb) => cb !== callback);
  };
}

function publish(eventName, data) {
  if (subscribers[eventName]) {
    const promises = subscribers[eventName].map((callback) => callback(data));
    return Promise.all(promises);
  }
  return Promise.resolve();
}
