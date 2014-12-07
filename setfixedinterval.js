// soft-require of debug / https://github.com/visionmedia/debug. don't want to force anybody to use it, but if you do it will log useful information
var debug;
try {
  debug = require('debug')('setfixedinterval');
}
catch(err) {
  debug = function(){}
}

function setFixedInterval(frequency, workFn, warnFn) {
  var obj = this;
  if (!(obj instanceof setFixedInterval)) {
    obj = new setFixedInterval();
  }
  obj.tickInterval = (1000 / (frequency || 15));
  obj.warnInterval = obj.tickInterval / 10; // warn by default at work taking 10% of interval
  obj.lastTick = Date.now();
  obj.workFn= workFn || function() {};
  obj.warnFn= warnFn || null;
  obj.timeout = null;
  return obj;
}

setFixedInterval.prototype = {
  start: function() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(this.run.bind(this), this.tickInterval);
  },

  stop: function() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  },

  runFor: function(seconds, completeFn) {
    // TODO: deal with already runFor'ing?
    // TODO: tuck these two timeouts into a single fn, deal with this.bind'ing. the +.01 is dumb.
    setTimeout(this.stop.bind(this), seconds*1000);
    if (completeFn != undefined) {
      setTimeout(completeFn, (seconds+.01)*1000);
    }
    this.start();
  },

  run: function() {
    var startWork = Date.now();

    // perforrm the caller's work
    this.workFn();

    var finishWork = Date.now();
    var workTime = finishWork - startWork;

    if (this.warnFn && workTime > this.warnInterval) {
      debug("warning: %s taking %dms of %dms available", (this.run.name || 'anonymous'), workTime, this.tickInterval);
      this.warnFn(workTime);
    }

    // find the next wall-clock expected tick which we haven't missed
    if (workTime > this.tickInterval) {
      debug('warning: %s dropped %d calls', (this.run.name || 'anonymous'), Math.floor(workTime/this.tickInterval));
      // TODO: optionally update the interval if we're even getting close to workTime == tickInterval
      // TODO: optionally try to temporarily adjust the refresh rate if loss happens frequently, then bring it back up to deal
      //  with spikey loads
    }
    // TODO: double-check how system clock resets (sleep/hibernate) impact this.
    var nextTick = startWork + ((Math.floor((finishWork - startWork) / this.tickInterval) + 1) * this.tickInterval) - finishWork;
    this.lastTick = startWork;
    debug("%s: startWork: %d, finishWork: %d, workTime: %d, nextTick in %d (%d)", (this.run.name || 'anonymous'), startWork, finishWork,
      workTime, nextTick, Date.now() + nextTick);

    // if the fixedInterval has been stop()'d during this.work() this.timeout will have been cleared so let's not reset
    if (this.timeout) {
      // extremely unexpected: if you don't clearTimeout() the timeout you're currently processing your 'reset'/chain call to yourself
      // with setTimeout will somehow leak information and introduce an additional delay of exactly how much time you just spent within
      // the call. e.g. if you are called on a 200ms setTimeout() then spend 50ms working and setTimeout for another 200ms in the future
      // you won't be called for 250ms. see https://github.com/joyent/node/issues/8105#issuecomment-65748632
      clearTimeout(this.timeout);
      this.timeout = setTimeout(this.run.bind(this), nextTick);
    }
  }
}

// frequency is a computed property on tickInterval
Object.defineProperty(setFixedInterval.prototype, "frequency", {
  get: function() { return 1000 / this.tickInterval; },
  set: function(frequency) { this.tickInterval = 1000 / frequency; }
});

module.exports = setFixedInterval;