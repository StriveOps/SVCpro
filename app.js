let peer = null;
let localStream = null;
let currentCall = null;
let savedRemoteStream = null;

const myIdEl = document.getElementById("my-id");
const peerIdInput = document.getElementById("peer-id-input");
const statusEl = document.getElementById("status");

const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");

const localEmpty = document.getElementById("local-empty");
const remoteEmpty = document.getElementById("remote-empty");

const startCameraBtn = document.getElementById("start-camera-btn");
const joinCallBtn = document.getElementById("join-call-btn");
const endCallBtn = document.getElementById("end-call-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const tapToPlayBtn = document.getElementById("tap-to-play");

window.addEventListener("load", () => {
  createPeer();
  bindEvents();
  loadJoinIdFromUrl();
});

function bindEvents() {
  startCameraBtn.addEventListener("click", startCamera);
  joinCallBtn.addEventListener("click", joinSession);
  endCallBtn.addEventListener("click", endCall);
  copyIdBtn.addEventListener("click", copyMyId);
  tapToPlayBtn.addEventListener("click", forcePlayRemote);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function showLocalPreview(show) {
  localVideo.style.display = show ? "block" : "none";
  localEmpty.style.display = show ? "none" : "flex";
}

function showRemotePreview(show) {
  remoteVideo.style.display = show ? "block" : "none";
  remoteEmpty.style.display = show ? "none" : "flex";
}

function createPeer() {
  const id = "so-" + Math.random().toString(36).slice(2, 8);

  peer = new Peer(id, {
    host: "0.peerjs.com",
    port: 443,
    secure: true
  });

  peer.on("open", (idValue) => {
    myIdEl.textContent = idValue;
    setStatus("Connected. You can now share your ID or join another session.");
  });

  peer.on("call", (incomingCall) => {
    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }

    currentCall = incomingCall;

    // Answer with local stream if available, otherwise answer as receive-only.
    if (localStream) {
      incomingCall.answer(localStream);
      setStatus("Incoming session connected. Sending your camera and receiving remote video.");
    } else {
      incomingCall.answer();
      setStatus("Incoming session connected in receive-only mode.");
    }

    attachCallEvents(incomingCall);
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    setStatus("Peer error: " + (err.type || "unknown"));
  });
}

async function startCamera() {
  try {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.playsInline = true;
    await localVideo.play();

    showLocalPreview(true);
    setStatus("Camera started. You can now receive viewers or join another device.");
  } catch (err) {
    console.error("Camera error:", err);
    setStatus("Could not start camera.");
    alert("Could not access camera and microphone.");
  }
}

function joinSession() {
  const targetId = peerIdInput.value.trim();

  if (!targetId) {
    alert("Paste an ID first.");
    return;
  }

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  setStatus("Joining session...");

  // If local camera exists, send it too. Otherwise join receive-only.
  currentCall = localStream
    ? peer.call(targetId, localStream)
    : peer.call(targetId);

  attachCallEvents(currentCall);
}

function attachCallEvents(call) {
  call.on("stream", (remoteStream) => {
    savedRemoteStream = remoteStream;
    attachRemoteStream(remoteStream);
  });

  call.on("close", () => {
    clearRemoteStream();
    setStatus("Session ended.");
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    setStatus("Call error.");
  });
}

function attachRemoteStream(stream) {
  remoteVideo.srcObject = stream;
  remoteVideo.playsInline = true;

  showRemotePreview(true);

  const playPromise = remoteVideo.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        tapToPlayBtn.style.display = "none";
        setStatus("Remote video connected.");
      })
      .catch((err) => {
        console.error("Autoplay blocked:", err);
        tapToPlayBtn.style.display = "block";
        setStatus("Remote stream received. Tap the button below to start playback.");
      });
  } else {
    setStatus("Remote video connected.");
  }
}

function forcePlayRemote() {
  if (savedRemoteStream && !remoteVideo.srcObject) {
    remoteVideo.srcObject = savedRemoteStream;
  }

  remoteVideo.play()
    .then(() => {
      tapToPlayBtn.style.display = "none";
      setStatus("Remote video connected.");
    })
    .catch((err) => {
      console.error("Manual play failed:", err);
      setStatus("Tap again to start remote playback.");
    });
}

function clearRemoteStream() {
  remoteVideo.srcObject = null;
  savedRemoteStream = null;
  showRemotePreview(false);
  tapToPlayBtn.style.display = "none";
}

function endCall() {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  clearRemoteStream();
  setStatus("Ready.");
}

async function copyMyId() {
  const myId = myIdEl.textContent;
  if (!myId || myId === "Connecting...") return;

  try {
    await navigator.clipboard.writeText(myId);
    setStatus("Your ID was copied.");
  } catch (err) {
    console.error("Clipboard error:", err);
    prompt("Copy this ID:", myId);
  }
}

function loadJoinIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const join = params.get("join");
  if (join) {
    peerIdInput.value = join;
  }
}
