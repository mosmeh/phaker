import * as Tone from 'tone';
import './style.css';
import worklet from '-!url-loader?limit=false!./worklet';

class Synth {
    async setup() {
        this._rawContext = new AudioContext({ sampleRate: 44100 });
        Tone.setContext(new Tone.Context(this._rawContext));

        await this._rawContext.audioWorklet.addModule(worklet, {
            credentials: 'omit',
        });
        const workletNode = new AudioWorkletNode(this._rawContext, 'main', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1],
        });
        this._port = workletNode.port;

        const reverb = new Tone.Reverb().set({
            wet: 0.2,
            decay: 0.3,
            preDelay: 0.01,
        });
        this._gain = new Tone.Gain(1);
        const limiter = new Tone.Limiter(-20);

        Tone.connectSeries(
            workletNode,
            reverb,
            this._gain,
            limiter,
            this._rawContext.destination
        );
    }

    get rawContext() {
        return this._rawContext;
    }

    set volume(value) {
        this._gain.gain.value = value;
    }

    setWorkletParams(params) {
        this._port.postMessage({
            type: 'params',
            params,
        });
    }

    excite(amp) {
        this._port.postMessage({
            type: 'excite',
            amp,
        });
    }
}

class Instructor {
    constructor(elem) {
        this._elem = elem;
        this._contextIsRunning = false;
        this._accelIsRunning = false;
        this._updateMessage();
    }

    set audioContextIsRunning(value) {
        this._contextIsRunning = value;
        this._updateMessage();
    }

    set accelerometerIsRunning(value) {
        this._accelIsRunning = value;
        this._updateMessage();
    }

    _updateMessage() {
        this._elem.innerHTML = (() => {
            if (this._accelIsRunning) {
                if (this._contextIsRunning) {
                    return 'Shake your device to play';
                } else {
                    return 'Tap the egg to start';
                }
            } else {
                return 'Click the egg to play';
            }
        })();
    }
}

const instructor = new Instructor(document.getElementById('message'));

let onShake = () => {};

navigator.permissions?.query({ name: 'accelerometer' }).then((status) => {
    if (status.state === 'denied') {
        return;
    }

    const accel = new LinearAccelerationSensor({ frequency: 60 });
    accel.onactivate = () => {
        instructor.accelerometerIsRunning = true;
        document.getElementById('sensitivity-li').classList.remove('hidden');
    };
    instructor.accelerometerIsRunning = false;

    let threshold;
    const sens = document.getElementById('sensitivity');
    function updateThreshold() {
        threshold = 9.8 * Math.max(0.1, +sens.max - +sens.value);
    }
    sens.addEventListener('input', updateThreshold);
    updateThreshold();

    accel.onreading = () => {
        const mag = Math.hypot(accel.x, accel.y, accel.z);
        if (mag > threshold) {
            onShake(mag / threshold);
        }
    };

    accel.start();
});

async function setupSynth() {
    await Tone.start();

    const synth = new Synth();
    await synth.setup();

    const context = synth.rawContext;
    context.onstatechange = () => {
        instructor.audioContextIsRunning = context.state === 'running';
    };
    instructor.audioContextIsRunning = context.state === 'running';

    const volume = document.getElementById('volume');
    volume.addEventListener('input', (e) => {
        synth.volume = +volume.value;
    });
    synth.volume = +volume.value;

    const params = {};
    [
        ['beads', 'numObjects'],
        ['motion', 'motion'],
    ].forEach(([id, param]) => {
        const slider = document.getElementById(id);
        slider.addEventListener('input', (e) => {
            params[param] = +slider.value;
            synth.setWorkletParams(params);
        });
        params[param] = +slider.value;
    });
    synth.setWorkletParams(params);

    const egg = document.getElementById('egg');

    let timeoutId = null;
    function excite(amp = 1) {
        clearTimeout(timeoutId);
        egg.classList.add('active');
        timeoutId = setTimeout(() => {
            egg.classList.remove('active');
        }, 100);
        synth.excite(amp);
    }

    function onMouseDown(e) {
        e.preventDefault();
        excite();
    }
    egg.addEventListener('mousedown', onMouseDown);
    egg.addEventListener('touchstart', onMouseDown);

    document.addEventListener('keydown', (e) => {
        if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
            return;
        }
        if (e.code === 'Space') {
            e.preventDefault();
            excite();
        }
    });

    onShake = excite;
}

setupSynth();

function resume() {
    Tone.start();
}

document.addEventListener('mousedown', resume);
document.addEventListener('keydown', resume);
