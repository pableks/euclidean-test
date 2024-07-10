import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Tone from 'tone';

interface TrackSettings {
  steps: number;
  pulses: number;
  gain: number;
  frequency: number;
  pan: number;
  pattern: boolean[];
  scheduleNote: (time: number, duration: number) => void;
  patternLength: number;
  instrument: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterFrequency: number;
  filterResonance: number;
}

interface TrackProps {
  trackId: number;
  onSettingsChange: (trackId: number, settings: TrackSettings) => void;
  isPlaying: boolean;
  currentStep: number;
  bpm: number;
  noteDuration: number;
}

type InstrumentType = Tone.Synth | Tone.AMSynth | Tone.FMSynth | Tone.MembraneSynth;

const INSTRUMENTS: { [key: string]: new () => InstrumentType } = {
  'Synth': Tone.Synth,
  'AMSynth': Tone.AMSynth,
  'FMSynth': Tone.FMSynth,
  'MembraneSynth': Tone.MembraneSynth,
};

const Track: React.FC<TrackProps> = ({ 
  trackId, 
  onSettingsChange, 
  isPlaying, 
  currentStep,
  bpm,
  noteDuration
}) => {
  const [steps, setSteps] = useState(16);
  const [pulses, setPulses] = useState(4);
  const [rotations, setRotations] = useState(0);
  const [gain, setGain] = useState(0.5);
  const [frequency, setFrequency] = useState(440);
  const [pan, setPan] = useState(0);
  const [pattern, setPattern] = useState<boolean[]>([]);
  const [instrument, setInstrument] = useState('Synth');
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.1);
  const [sustain, setSustain] = useState(0.5);
  const [release, setRelease] = useState(0.5);
  const [filterFrequency, setFilterFrequency] = useState(3000);
  const [filterResonance, setFilterResonance] = useState(1);
  const [reverbDecay, setReverbDecay] = useState(1);
  const instrumentRef = useRef<InstrumentType | null>(null);
  const filterRef = useRef<Tone.Filter | null>(null);
  const [frequencySliderValue, setFrequencySliderValue] = useState(0.5);


  const PENTATONIC_SCALE = [
    261.63, 293.66, 329.63, 392.00, 440.00, // C4, D4, E4, G4, A4
    523.25, 587.33, 659.25, 783.99, 880.00, // C5, D5, E5, G5, A5
    1046.50, 1174.66, 1318.51, 1567.98, 1760.00 // C6, D6, E6, G6, A6
  ];
  const handleFrequencyChange = useCallback((value: number) => {
    setFrequencySliderValue(value);
    const minFreq = PENTATONIC_SCALE[0];
    const maxFreq = PENTATONIC_SCALE[PENTATONIC_SCALE.length - 1];
    const freq = minFreq * Math.pow(maxFreq / minFreq, value);
    const snappedFreq = snapToNearestNote(freq);
    setFrequency(snappedFreq);
    if (instrumentRef.current) {
      instrumentRef.current.frequency.rampTo(snappedFreq, 0.1);
    }
  }, []);
  
  const snapToNearestNote = (freq: number) => {
    return PENTATONIC_SCALE.reduce((prev, curr) => 
      Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev
    );
  };

  const getNoteNameFromFrequency = (freq: number) => {
    const noteNames = ["C", "D", "E", "G", "A"];
    const index = PENTATONIC_SCALE.indexOf(snapToNearestNote(freq));
    const octave = Math.floor(index / 5) + 4;
    return `${noteNames[index % 5]}${octave}`;
  };

  
  const generatePattern = useCallback((steps: number, pulses: number, rotations: number) => {
    if (pulses === 0) return new Array(steps).fill(false);
    let pattern = new Array(steps).fill(false);
    const increment = steps / pulses;
    let index = 0;
    for (let i = 0; i < pulses; i++) {
      pattern[Math.floor(index) % steps] = true;
      index += increment;
    }
    pattern = [...pattern.slice(rotations), ...pattern.slice(0, rotations)];
    return pattern;
  }, []);

  useEffect(() => {
    const newPattern = generatePattern(steps, Math.min(pulses, steps), rotations);
    setPattern(newPattern);
  
    // Dispose of the existing instrument and filter
    if (instrumentRef.current) {
      instrumentRef.current.set({
        envelope: { attack, decay, sustain, release },
      });
      instrumentRef.current.volume.rampTo(Tone.gainToDb(gain), 0.1);
      instrumentRef.current.frequency.rampTo(frequency, 0.1);
    }
  
    if (filterRef.current) {
      filterRef.current.frequency.rampTo(filterFrequency, 0.1);
      filterRef.current.Q.rampTo(filterResonance, 0.1);
    }
  
    // Create new instrument and filter
    instrumentRef.current = new INSTRUMENTS[instrument]();
    filterRef.current = new Tone.Filter(filterFrequency, 'lowpass');
    const reverb = new Tone.Reverb(decay).toDestination();
  
    // Chain the instrument to the filter, then to the reverb, and finally to the destination
    if (instrumentRef.current && filterRef.current) {
      instrumentRef.current.chain(filterRef.current, reverb, Tone.getDestination());
    }
  
    // Update instrument settings
    if (instrumentRef.current) {
      instrumentRef.current.set({
        envelope: { attack, decay, sustain, release },
        volume: Tone.gainToDb(gain),
      });
    }
  
    // Update filter settings
    if (filterRef.current) {
      filterRef.current.frequency.value = filterFrequency;
      filterRef.current.Q.value = filterResonance;
    }
  
    const scheduleNote = (time: number, duration: number) => {
      if (instrumentRef.current) {
        instrumentRef.current.triggerAttackRelease(frequency, duration, time);
      }
    };
  
    onSettingsChange(trackId, {
      steps,
      pulses: Math.min(pulses, steps),
      gain,
      frequency,
      pan,
      pattern: newPattern,
      scheduleNote,
      patternLength: steps,
      instrument,
      attack,
      decay,
      sustain,
      release,
      filterFrequency,
      filterResonance,
    });
  }, [steps, pulses, rotations, gain, frequency, pan, instrument, attack, decay, sustain, release, filterFrequency, filterResonance, generatePattern, onSettingsChange, trackId]);

  const renderCircularPattern = () => {
    const radius = 50;
    const centerX = 60;
    const centerY = 60;

    return (
      <svg width="120" height="120" viewBox="0 0 120 120">
        {pattern.map((active, index) => {
          const angle = (index / steps) * 2 * Math.PI - Math.PI / 2;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          const isCurrentStep = index === Math.floor(currentStep / 32 * steps) % steps;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={4}
              fill={isCurrentStep ? '#FFFFFF' : (active ? '#4CAF50' : '#757575')}
            />
          );
        })}
      </svg>
    );
  };

  return (
    <div className="mb-4 p-4 bg-gray-800 rounded-lg text-white">
      <h3 className="text-xl font-bold mb-2">Track {trackId}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
  Reverb Decay:
  <input
    type="range"
    min="0.1"
    max="10"
    step="0.1"
    value={reverbDecay}
    onChange={(e) => setReverbDecay(parseFloat(e.target.value))}
    className="ml-2 w-full"
  />
  <span>{reverbDecay.toFixed(1)}s</span>
</label>
        <label className="block">
          Steps:
          <input
            type="range"
            min="1"
            max="32"
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{steps}</span>
        </label>
        <label className="block">
          Pulses:
          <input
            type="range"
            min="0"
            max={steps}
            value={Math.min(pulses, steps)}
            onChange={(e) => setPulses(Math.min(parseInt(e.target.value), steps))}
            className="ml-2 w-full"
          />
          <span>{Math.min(pulses, steps)}</span>
        </label>
        <label className="block">
          Rotations:
          <input
            type="range"
            min="0"
            max={steps - 1}
            value={rotations}
            onChange={(e) => setRotations(parseInt(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{rotations}</span>
        </label>
        <label className="block">
          Pan:
          <input
            type="range"
            min="-1"
            max="1"
            step="0.1"
            value={pan}
            onChange={(e) => setPan(parseFloat(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{pan.toFixed(1)}</span>
        </label>
        <label className="block">
  Volume:
  <input
    type="range"
    min="0"
    max="1"
    step="0.01"
    value={gain}
    onChange={(e) => {
      const newGain = parseFloat(e.target.value);
      setGain(newGain);
      if (instrumentRef.current) {
        instrumentRef.current.volume.rampTo(Tone.gainToDb(newGain), 0.1);
      }
    }}
    className="ml-2 w-full"
  />
  <span>{(Math.log10(gain) * 20).toFixed(1)} dB</span>
</label>
<label className="block">
  Pitch:
  <input
    type="range"
    min="0"
    max="1"
    step="0.001"
    value={frequencySliderValue}
    onChange={(e) => handleFrequencyChange(parseFloat(e.target.value))}
    className="ml-2 w-full"
  />
  <span>{Math.round(frequency)} Hz ({getNoteNameFromFrequency(frequency)})</span>
</label>
        <label className="block">
          Instrument:
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            className="ml-2 bg-gray-700 rounded"
          >
            {Object.keys(INSTRUMENTS).map((inst) => (
              <option key={inst} value={inst}>{inst}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Attack:
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={attack}
            onChange={(e) => setAttack(parseFloat(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{attack.toFixed(2)}s</span>
        </label>
        <label className="block">
          Decay:
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={decay}
            onChange={(e) => setDecay(parseFloat(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{decay.toFixed(2)}s</span>
        </label>
        <label className="block">
          Sustain:
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={sustain}
            onChange={(e) => setSustain(parseFloat(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{sustain.toFixed(2)}</span>
        </label>
        <label className="block">
          Release:
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={release}
            onChange={(e) => setRelease(parseFloat(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{release.toFixed(2)}s</span>
        </label>
        <label className="block">
          Filter Frequency:
          <input
            type="range"
            min="100"
            max="10000"
            step="100"
            value={filterFrequency}
            onChange={(e) => setFilterFrequency(parseInt(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{filterFrequency} Hz</span>
        </label>
        <label className="block">
          Filter Resonance:
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={filterResonance}
            onChange={(e) => setFilterResonance(parseFloat(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{filterResonance.toFixed(1)}</span>
        </label>
      </div>
      <div className="mt-4">
        {renderCircularPattern()}
      </div>
    </div>
  );
};




const EuclideanSequencer: React.FC = () => {
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [masterGain, setMasterGain] = useState(0.7);
  const [currentStep, setCurrentStep] = useState(0);
  const [noteDuration, setNoteDuration] = useState(0.2);
  const currentStepRef = useRef(currentStep);
  const tracksRef = useRef<Record<number, TrackSettings>>({});
  const lastPlayedStepRef = useRef<Record<number, number>>({});

  useEffect(() => {
    Tone.getDestination().volume.value = Tone.gainToDb(masterGain);
  }, [masterGain]);

  const handleSettingsChange = useCallback((trackId: number, settings: TrackSettings) => {
    tracksRef.current[trackId] = settings;
  }, []);

  const startSequencer = useCallback(() => {
    const transport = Tone.getTransport();
    if (transport.state !== 'started') {
      transport.start();
    }
    setIsPlaying(true);
    setIsPaused(false);
  }, []);

  const stopSequencer = () => {
    const transport = Tone.getTransport();
    transport.stop();
    setIsPlaying(false);
    setIsPaused(false);
    currentStepRef.current = 0;
    lastPlayedStepRef.current = {};
    setCurrentStep(0);
  };

  const pauseSequencer = () => {
    const transport = Tone.getTransport();
    transport.pause();
    setIsPlaying(false);
    setIsPaused(true);
  };

  const handleBpmChange = (newBpm: number) => {
    setBpm(newBpm);
    const transport = Tone.getTransport();
    transport.bpm.value = newBpm;
  };

  useEffect(() => {
    const transport = Tone.getTransport();
    transport.bpm.value = bpm;
    
    const repeatingEvent = transport.scheduleRepeat((time) => {
      Object.entries(tracksRef.current).forEach(([trackIdStr, track]) => {
        const trackId = parseInt(trackIdStr, 10);
        const trackStep = Math.floor(currentStepRef.current / 32 * track.steps) % track.steps;
        
        if (track.pattern[trackStep] && lastPlayedStepRef.current[trackId] !== trackStep) {
          track.scheduleNote(time, noteDuration);
          lastPlayedStepRef.current[trackId] = trackStep;
        }
      });

      currentStepRef.current = (currentStepRef.current + 1) % 32;
      setCurrentStep(currentStepRef.current);
    }, '16n');

    return () => {
      transport.clear(repeatingEvent);
    };
  }, [bpm, noteDuration]);

  return (
    <div className="p-4 bg-gray-100 rounded-lg shadow-md max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Euclidean Sequencer with Tone.js</h2>
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          BPM:
          <input
            type="number"
            value={bpm}
            onChange={(e) => handleBpmChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="ml-2 p-1 border rounded w-20"
          />
        </label>
        <label className="block">
  Master Gain:
  <input
    type="range"
    min="0"
    max="1"
    step="0.01"
    value={masterGain}
    onChange={(e) => {
      const newGain = parseFloat(e.target.value);
      setMasterGain(newGain);
      Tone.getDestination().volume.rampTo(Tone.gainToDb(newGain), 0.1);
    }}
    className="ml-2 w-full"
  />
  <span>{(Math.log10(masterGain) * 20).toFixed(1)} dB</span>
</label>
        <label className="block">
          Note Duration:
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={noteDuration}
            onChange={(e) => setNoteDuration(parseFloat(e.target.value))}
            className="ml-2 w-full"
          />
          <span>{noteDuration.toFixed(2)}s</span>
        </label>
      </div>
      <div className="mb-4 flex space-x-2">
        <button
          onClick={startSequencer}
          className={`px-4 py-2 text-white rounded transition-colors ${
            isPlaying ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isPlaying ? 'Resume' : 'Start'}
        </button>
        <button
          onClick={pauseSequencer}
          disabled={!isPlaying}
          className={`px-4 py-2 text-white rounded transition-colors ${
            isPlaying
              ? 'bg-yellow-500 hover:bg-yellow-600'
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          Pause
        </button>
        <button
          onClick={stopSequencer}
          disabled={!isPlaying && !isPaused}
          className={`px-4 py-2 text-white rounded transition-colors ${
            isPlaying || isPaused
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          Stop
        </button>
      </div>
      <Track
        trackId={1}
        onSettingsChange={handleSettingsChange}
        isPlaying={isPlaying}
        currentStep={currentStep}
        bpm={bpm}
        noteDuration={noteDuration}
      />
      <Track
        trackId={2}
        onSettingsChange={handleSettingsChange}
        isPlaying={isPlaying}
        currentStep={currentStep}
        bpm={bpm}
        noteDuration={noteDuration}
      />
  
    </div>
  );
};

export default EuclideanSequencer;



