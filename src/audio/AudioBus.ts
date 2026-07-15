import { loadSettings } from "../game/persistence";

type SoundCue = "start" | "deploy" | "place" | "queue" | "mutation" | "success" | "warning" | "victory" | "defeat";

const CUES: Record<SoundCue, { frequencies: number[]; duration: number; gain: number; wave: OscillatorType }> = {
  start: { frequencies: [74, 111, 166], duration: 0.34, gain: 0.035, wave: "sawtooth" },
  deploy: { frequencies: [92, 138, 207], duration: 0.42, gain: 0.045, wave: "square" },
  place: { frequencies: [155, 118], duration: 0.09, gain: 0.025, wave: "square" },
  queue: { frequencies: [240, 310], duration: 0.08, gain: 0.018, wave: "sine" },
  mutation: { frequencies: [130, 195, 292, 438], duration: 0.55, gain: 0.035, wave: "sine" },
  success: { frequencies: [210, 315], duration: 0.12, gain: 0.02, wave: "sine" },
  warning: { frequencies: [96, 82], duration: 0.16, gain: 0.026, wave: "sawtooth" },
  victory: { frequencies: [98, 147, 220, 330], duration: 0.8, gain: 0.045, wave: "triangle" },
  defeat: { frequencies: [120, 90, 67], duration: 0.75, gain: 0.04, wave: "sawtooth" },
};

class AudioBus {
  private context: AudioContext | null = null;

  play(cue: SoundCue): void {
    try {
      const settings = loadSettings();
      if (!settings.sfxEnabled || settings.masterVolume <= 0) return;
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
      const config = CUES[cue];
      const now = this.context.currentTime;
      const master = this.context.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(config.gain * settings.masterVolume, now + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);
      master.connect(this.context.destination);
      config.frequencies.forEach((frequency, index) => {
        const oscillator = this.context!.createOscillator();
        const voiceGain = this.context!.createGain();
        oscillator.type = config.wave;
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.detune.setValueAtTime((index - config.frequencies.length / 2) * 3, now);
        voiceGain.gain.value = 1 / config.frequencies.length;
        oscillator.connect(voiceGain);
        voiceGain.connect(master);
        oscillator.start(now + index * 0.025);
        oscillator.stop(now + config.duration + 0.04);
      });
    } catch {
      // Audio is enhancement-only; browsers may block AudioContext creation.
    }
  }
}

export const audioBus = new AudioBus();
