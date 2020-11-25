const AMP = 1e-4;

class Energizer {
    constructor() {
        this.motion = 0.05;
        this._amp = 0;
        this._phase = Infinity;
    }

    excite(amp) {
        this._amp = amp;
        this._phase = 0;
    }

    process() {
        if (this._phase > 2 * Math.PI) {
            return 0;
        }

        this._phase += (2 * Math.PI) / sampleRate / this.motion;
        return this._amp * (1 - Math.cos(this._phase));
    }
}

class Filter {
    constructor(freq, reso) {
        this._a = [
            -reso * 2 * Math.cos((2 * Math.PI * freq) / sampleRate),
            reso * reso,
        ];
        this._outputs = [0, 0];
    }

    process(input) {
        input += -this._a[0] * this._outputs[0] - this._a[1] * this._outputs[1];
        this._outputs[1] = this._outputs[0];
        this._outputs[0] = input;
        return this._outputs[1];
    }
}

class EQ {
    constructor(b0, b1, b2) {
        this._b = [b0, b1, b2];
        this._inputs = [0, 0];
    }

    process(input) {
        const output =
            this._b[0] * input +
            this._b[1] * this._inputs[0] +
            this._b[2] * this._inputs[1];
        this._inputs[1] = this._inputs[0];
        this._inputs[0] = input;
        return output;
    }
}

class Shaker {
    constructor(soundDecay, systemDecay) {
        this._numObjects = 1;
        this._gain = 0;
        this._shakeEnergy = 0;
        this._soundLevel = 0;
        this._soundDecay = soundDecay;
        this._systemDecay = systemDecay;
        this._energizer = new Energizer(0.05);
        this._filter = new Filter(3200, 0.96, 1);
        this._eq = new EQ(1, -1, 0);
    }

    setParams({ numObjects, motion }) {
        this._numObjects = numObjects;
        this._gain =
            ((Math.log(this._numObjects) / Math.log(4)) * 40) /
            this._numObjects;
        this._energizer.motion = motion;
    }

    excite(amp) {
        this._energizer.excite(amp);
    }

    process() {
        this._shakeEnergy += this._energizer.process();
        this._shakeEnergy *= this._systemDecay;

        if (Math.random() * 1024 < this._numObjects) {
            this._soundLevel += this._gain * this._shakeEnergy;
        }

        const x = this._soundLevel * (2 * Math.random() - 1);
        this._soundLevel *= this._soundDecay;

        return this._eq.process(this._filter.process(x));
    }
}

class Processor extends AudioWorkletProcessor {
    constructor() {
        super();

        this._shaker = new Shaker(0.95, 0.999);

        this.port.onmessage = (msg) => {
            const { data } = msg;
            switch (data.type) {
                case 'excite':
                    this._shaker.excite(data.amp);
                    break;
                case 'params':
                    this._shaker.setParams(data.params);
                    break;
            }
        };
    }

    process(_, outputs) {
        const out = outputs[0][0];
        for (let i = 0; i < out.length; ++i) {
            out[i] = AMP * this._shaker.process();
        }
        return true;
    }
}

registerProcessor('main', Processor);
