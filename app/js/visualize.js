let audioCtx = null;

function visualizeStream(player, canvas_elem, stream) {
    audioCtx = audioCtx || new AudioContext();
    const analyser = audioCtx.createAnalyser();  
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArrayAlt = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArrayAlt);
    const canvasCtx = canvas_elem.getContext("2d");
    WIDTH = canvas_elem.width;
    HEIGHT = canvas_elem.height;
    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      const drawAlt = function () {
        drawVisual = requestAnimationFrame(drawAlt);

        analyser.getByteFrequencyData(dataArrayAlt);

        canvasCtx.fillStyle = "rgb(211,211,211)";
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

        const barWidth = (WIDTH / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArrayAlt[i];

          canvasCtx.fillStyle = "rgb(30,144,255)";
          canvasCtx.fillRect(
            x,
            HEIGHT - barHeight / 4,
            barWidth,
            barHeight / 4
          );

          x += barWidth + 1;
        }
      };

      drawAlt();
}