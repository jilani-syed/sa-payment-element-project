'use strict';

function log(level, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details
  };

  const serializedEntry = JSON.stringify(entry);

  if (level === 'error') {
    console.error(serializedEntry);
  } else if (level === 'warn') {
    console.warn(serializedEntry);
  } else {
    console.log(serializedEntry);
  }
}

module.exports = {
  error(event, details) {
    log('error', event, details);
  },
  info(event, details) {
    log('info', event, details);
  },
  warn(event, details) {
    log('warn', event, details);
  }
};
