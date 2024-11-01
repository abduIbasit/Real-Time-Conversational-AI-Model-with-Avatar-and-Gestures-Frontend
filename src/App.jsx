import { useState, useEffect, useRef } from "react";
import { FiSend, FiMic, FiPause } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import { v4 as uuidv4 } from "uuid";

const wsUrl = "ws://34.55.139.78:8000/ws/conversation";

function App() {
  const [messages, setMessages] = useState({});
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [currentSession, setCurrentSession] = useState("Chat 1");
  const [sessions, setSessions] = useState(["Chat 1"]);
  const [isPaused, setIsPaused] = useState(false);
  const ws = useRef(null);
  const chatEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => console.log("Connected to WebSocket server");

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const isVideoMessage = message.video_url && message.video_url.includes("http");

      if (message.transcribed_text) {
        // Handle and display the transcribed text as the user message
        setMessages((prev) => ({
          ...prev,
          [currentSession]: [
            ...(prev[currentSession] || []),
            { id: uuidv4(), user: "User", text: message.transcribed_text },
          ],
        }));
      } else if (message.text) {
        // Display the AI's generated response
        setMessages((prev) => ({
          ...prev,
          [currentSession]: [
            ...(prev[currentSession] || []),
            { id: uuidv4(), user: "AI", text: message.text },
          ],
        }));
      }
    };


    ws.current.onclose = () => console.log("Disconnected from WebSocket server");
    ws.current.onerror = (error) => console.error("WebSocket error:", error);

    return () => ws.current.close();
  }, [currentSession]);

  const sendMessage = (text, audio = null) => {
    if (ws.current.readyState === WebSocket.OPEN) {
      let data;
  
      if (audio) {
        const reader = new FileReader();
        reader.readAsDataURL(audio); // Convert blob to Base64
        reader.onloadend = () => {
          const base64Audio = reader.result.split(",")[1]; // Remove metadata
          data = { audio: base64Audio, session_id: currentSession };
  
          // Send Base64 encoded audio data
          ws.current.send(JSON.stringify(data));
        };
      } else {
        data = { prompt: text, session_id: currentSession };
        ws.current.send(JSON.stringify(data));

        setMessages((prev) => ({
          ...prev,
          [currentSession]: [
            ...(prev[currentSession] || []),
            { id: uuidv4(), user: "User", text },
          ],
        }));
        setInput("");
      }
    } else {
      console.error("WebSocket is not open.");
    }
  };
  

  const handleSend = () => {
    if (audioBlob) {
      sendMessage("", audioBlob);
      setAudioBlob(null);
    } else if (input.trim()) {
      sendMessage(input);
    }
  };

  const handleMicClick = () => {
    if (!isRecording) {
      startRecording();
      setIsRecording(true);
    } else if (isPaused) {
      resumeRecording();
    } else {
      stopRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;

      const source = audioCtxRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      visualize(); // Start visualization

      mediaRecorderRef.current = new MediaRecorder(stream);
      const chunks = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(audioBlob);
        stopVisualization();
      };

      mediaRecorderRef.current.start();
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const pauseRecording = () => {
    mediaRecorderRef.current.pause();
    setIsPaused(true);
  };

  const resumeRecording = () => {
    mediaRecorderRef.current.resume();
    setIsPaused(false);
  };

  const stopRecording = () => {
    mediaRecorderRef.current.stop();  // Ensures recording is stopped
    setIsRecording(false);
    setIsPaused(false);
  };

  const stopVisualization = () => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const visualize = () => {
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!audioCtxRef.current) return;

      analyserRef.current.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = "rgb(255, 255, 255)";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = "rgb(0, 0, 255)";
      canvasCtx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();

      requestAnimationFrame(draw);
    };
    draw();
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages[currentSession]]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar for Chat Sessions */}
      <div className="w-1/5 bg-gray-50 p-4 flex flex-col">
        <h2 className="text-lg font-bold mb-4 text-black">Chat Sessions</h2>
        <div className="flex-1 overflow-y-auto">
          {sessions.map((session) => (
            <div
              key={session}
              onClick={() => setCurrentSession(session)}
              className={`p-2 rounded cursor-pointer text-black ${
                currentSession === session ? "bg-gray-100" : "hover:bg-gray-100"
              }`}
            >
              {session}
            </div>
          ))}
        </div>
        <button
          onClick={() => setSessions([...sessions, `Chat ${sessions.length + 1}`])}
          className="mt-4 p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          New Chat
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex flex-col w-4/5 bg-white">
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          {(messages[currentSession] || []).map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.user === "User" ? "justify-end" : "justify-center"
              }`}
            >
              <div
                className={`${
                  msg.user === "User"
                    ? "bg-gray-200 text-black mr-4"
                    : "text-black"
                } p-3 rounded-lg max-w-2xl`}
              >
                {msg.video_url ? (
                  <video controls type="video/mp4" src={msg.video_url} className="mt-2 rounded-lg" width="100%"></video>
                ) : msg.user === "AI" ? (
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Sound Wave Visualization */}
        <canvas ref={canvasRef} className="h-10 mb-2 w-full"></canvas>

        {/* Message Input Area */}
        <div className="p-3 border-t border-gray-200 flex items-center space-x-3 px-36">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Message Vastlearn AI"
            className="flex-1 p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-400 max-w-2xl"
          />
          <button
            onClick={handleMicClick}
            className={`p-2 rounded-full ${isRecording ? "bg-red-500 text-white" : "bg-gray-200 text-gray-600"}`}
          >
            {isRecording ? (isPaused ? <FiMic size={20} /> : <FiPause size={20} />) : <FiMic size={20} />}
          </button>
          <button
            onClick={handleSend}
            className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600"
          >
            <FiSend size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
