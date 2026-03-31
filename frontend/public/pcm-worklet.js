class PCMWorkletProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channel = input[0];
      const pcm16 = new Int16Array(channel.length);

      for (let i = 0; i < channel.length; i++) {
        // Clamp and convert to 16-bit PCM
        const s = Math.max(-1, Math.min(1, channel[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorkletProcessor);
