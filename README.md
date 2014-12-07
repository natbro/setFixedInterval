#setFixedInterval

A lightweight [`setInterval()`](http://nodejs.org/api/timers.html#timers_setinterval_callback_delay_arg)-like fixed-frequency callback driver with lower frequency-variance in the face of >1ms callback work and therefore strong affinity to the expected periodicity vs wall-clock time.

##Background
The built-in `setTimeout()` and `setInterval()` functions in node and web browsers are often used for deferred work and recurring work. We `setTimeout()` some work for a few seconds or ms later to prevent blocking a UI thread in the browser, or we `setInterval()` some work to flush buffers or relay data to caches or to network clients in the "background" of a node application. All other things (GC, other CPU and I/O activity) being equal `setInterval()` offers extremely low variance in callback frequency for very short callbacks. If you ask for calls every 66.666ms your callback will fire every 67ms almost perfectly, with a mean of 67 and a steady variance of less than 0.2ms on most systems. That is, until your callback has more than 1-2ms of work to do - add 5ms of work (or simulate it with a call to a sleep/usleep function) and suddenly your mean is 74ms and your variance doubles. And it only gets worse the more work or variation in work length you do in your callback. Furthermore you are drifting off the periodicity of your original starting time. Node's `setInterval()` on all systems I've tested actually schedules the next call for it's next recurring interval (say 67ms in our example) *after* the callback returns.

If you want callbacks to occur with regular frequency according to the wall-clock and independent of the amount of time you spend in the callback, give `setFixedInterval` a try. I'm finding it particularly useful for a network server communicating with a large number of clients in networked multi-player games, to keep network activity steady and dependable (low variance between updates) which acts to decrease perceived network lagginess and maintains consistency.

##Dependencies
None, although it soft-depends on [`debug`](https://github.com/visionmedia/debug) so if you already use `debug` in your application you can enable more timing and warning information for your callbacks by launching node as `DEBUG="setfixedinterval" node` from the command-line or at runtime by calling `debug.enable('setfixedinterval');`.

##Installation & Use
 * Add `"setfixedinterval": "1.*"` to your `package.json`
 * `npm install`
 * use `setFixedInterval = require('setfixedinterval');` to load the package
 * create a fixed-interval object either directly `x = setFixedInterval(freq, fn)` or with `x = new setFixedInterval(freq, fn)` (both work identically) specifying a frequency (callbacks/second) and a callback function.
 * use `.start()` to begin callbacks at the specified frequency and `.stop()` to stop them again. you can `stop()` and `start()` as many times as you like
 * use `.runFor(seconds)` to have the callback run at its frequency for `seconds` and automatically stop. this act of automatically starting and continuing for a fixed period of time comes up often enough to deserve its own construct. 
 * change the frequency of callbacks by assigning a new rate in [Hz](http://en.wikipedia.org/wiki/Hertz) (calls per second) to `.frequency`. the callback after the next scheduled callback will start at the new frequency.
 * change the callback function by assigning a new function to `.work`

##Examples
 1. Output the current time 30 times per second indefinitely:

    ```js
    setFixedInterval(30, function() {
 	     console.log('time is ' + Date.now());
 	   }).start();
    ```

 2. Output the current time 15 times per second for 5 seconds:

    ```js
    setFixedInterval(15, function() {
        console.log('time is ' + Date.now());
      }).runFor(5);
    ```

 3. Alternate some work @10Hz for 10 seconds and @30Hz for 10 seconds, indefinitely. You could do this manually with `.stop()` and `.start()` and external events as well, this is just one way to accomplish this task.

    ```js
    var loop = setFixedInterval(10, function() { /* some work */ } ).start();
    // 0.1Hz = every 10s, perform frequency flipping
    setFixedInterval(0.1, function() {
        loop.frequency = (loop.frequency == 10) ? 30 : 10;
      }).start();
    ```

##Reference
###Constructors
 * `[new] setFixedInterval(frequency, workFn, warnFn)` allocates and returns a new not-yet-running `setFixedInterval` object which, once `.start()`'d or `.runFor()`'d, will call `workFn` at the given `frequency`.


###Properties
 * `.frequency` (read/write) get or set the frequency (in Hz, or calls-per-second) of the callbacks.
 * `.tickInterval` (read-only) time in milliseconds between callbacks. use `.frequency` to change `.tickInterval`.
 * `.warnInterval` (read/write) when the duration of the callback to `.workFn` exceeds this time in milliseconds (defaults to 10% of `.tickInterval`) `.warnFn` will be called and passed the total time `.workFn` took, giving an opportunity for the consumer to decrease the amount of work or lower the `.frequency`.
 * `.workFn` (read/write) the function to call during each callback
 * `.warnFn` (read/write) the function to call if the time spent executing `workFn` during each callback exceeds `.warnInterval` milliseconds.

###Methods
 * `.start()` starts calling the callback. calling `.start()` on an already running callback will reset the callback's time-alignment to the current time.
 * `.stop()` stops calls to the callback. calling `.stop()` on an already stopped object has no effect.
 * `.runFor(seconds, completeFn)` starts calling the callback for `seconds` seconds (may be fractional/floating-point) and optionally (if provided) calls `completeFn` after the callback's last call. Calling `.runFor()` on an already `.start()`'d callback will reset the time-alignment to the current time. Calling `.runFor()` on an already `.runFor()`'ing callback is (currently) unpredictable.

##Analysis
To measure or see the difference between `setInterval()` and `setFixedInterval()` for your platform, try pasting the following code into a node REPL:

```js
// this is a busy-/spin-wait sleep - you're welcome to test with the true
// sleep.sleep()/.usleep() package, it makes no difference to these measurements
function sleep(ms) { var start=Date.now(); while (Date.now()-start < ms); }

var setFixedInterval = require('setfixedinterval');
var duration=5, rate=15, i=0;
var d=[], // samples of raw start-times of each callback
    c=[], // difference between adjacent pairs of callback start-times
    mean=0, variance=0, stddev=0;
var testLoop=setFixedInterval(rate, function() {
    d[i++] = Date.now(); // collect samples
    sleep(10);
  });

function calculate() {
  // compute c[]'s
  c=d.map(function(a,i,ar) { return (i==ar.length-1) ? null : ar[i+1]-a; });
  c.splice(c.length-1,1); // only N-1 deltas in N samples, remove trailing null
    
  mean=c.reduce(function(sum, a,i,ar) { sum += a;  return i==ar.length-1?(ar.length==0?0:sum/ar.length):sum},0);
    
  variance=c.reduce(function(variance, a,i,ar) { variance += Math.pow(a-mean,2); return (i==ar.length-1) ? (ar.length==0 ? 0 : variance/ar.length) : variance}, 0);
    
  stddev=Math.sqrt(variance);
} 
  
testLoop.runFor(duration, function() {
    calculate();
    console.log("setFixedInterval:" + c.length + " samples at " + rate + "Hz (" + (1000/rate) + "ms intervals). mean=" + mean + ", variance=" + variance + ", stddev=" + stddev);
  });
```
 This will output something like:
 `setFixedInterval:73 samples at 15Hz (66.66666666666667ms intervals). mean=66.73972602739725, variance=0.19253143178832777, stddev=0.43878403775471114`
 
 Next paste in a `setInterval` version:

```js
i=0; d=[]; c=[]; // reset data collection

// collect setInterval samples
interval=setInterval(function() { d[i++] = Date.now(); sleep(10); }, 1000/rate);

setTimeout(function() {
    clearInterval(interval);
    calculate();
    console.log("setInterval:" + c.length + " samples at " + rate + "Hz (" + (1000/rate) + "ms intervals). mean=" + mean + ", variance=" + variance + ", stddev=" + stddev);
    },duration*1000);

```
 This will output something like:
 `setInterval:57 samples at 15Hz (66.66666666666667ms intervals). mean=86.2280701754386, variance=0.42166820560172413, stddev=0.6493598429235705`

##References
Timer drift is everywhere in system software, scheduling, drivers, interrupt handling, peripheral data collection, and game development. I most recently ran into timer-drift while tracking elapsed time in [one of my iOS game apps](https://itunes.apple.com/us/app/tile-find-words-fast/id770231137?mt=8). I couldn't get adequate accuracy from [`NSTimer`](https://developer.apple.com/Library/ios/documentation/Cocoa/Reference/Foundation/Classes/NSTimer_Class/index.html), (losing as much as 2 seconds of wall-clock over just 60 1Hz callbacks - I wasn't expecting that much drift!) so I shifted to a higher-speed [`CADisplayLink`](https://developer.apple.com/library/iOs/documentation/QuartzCore/Reference/CADisplayLink_ClassRef/index.html) and tracked elapsed wall-clock time from the 60Hz callback via `CFAbsoluteTimeGetCurrent()` (the iOS equivalent of Javascript's `Date.now()` or `new Date().getTime()`). No more drift and very low variance from the wall-clock changing the on-screen time.

Both of these links were useful to my understanding of accurate timers in iOS and Javascript leading to implementing `setFixedInterval`, you may also find them interesting:
 * [How do I create an accurate timer event in Objective-C/iOS?](http://stackoverflow.com/a/10715366/452082)
 * [Creating Accurate Timers in Javascript](http://www.sitepoint.com/creating-accurate-timers-in-javascript/)

##License
[MIT](http://opensource.org/licenses/MIT)

##Contact
[natbro@gmail.com](mailto:natbro@gmail.com) | [@natbro](http://twitter.com/natbro)