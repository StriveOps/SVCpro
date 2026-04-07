let peer = null;
let localStream = null;
let currentCall = null;
let pendingIncomingCall = null;
let pendingRemoteStream = null;

const myIdEl = document.getElementById("my-id");
const remoteIdInput = document.getElementById("remote-id-input");
const statusEl = document.getElementById("status");

const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");

const localPlaceholder = document.getElementById("local-placeholder");
const remotePlaceholder = document.getElementById("remote-placeholder");

const startCameraBtn = document.getElementById("start-camera-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const connectBtn = document.getElementById("connect-btn");
const hangupBtn = document.getElementById("hangup-btn");
const tapPlayBtn = document.getElementById("tap-play-btn");

const incomingCallModal = document.getElementById("incoming-call");
const callerIdEl = document.getElementById("caller-id");
const acceptCallBtn = document.getElementById("accept-call-btn");
const declineCallBtn = document.getElementById("decline-call-btn");

window.addEventListener("load", () => {
  bindEvents();
  createPeer();
  preloadJoinId();
  debugStatus("Page loaded. Waiting for peer connection...");
});

function bindEvents() {
  startCameraBtn.addEventListener("click", startCamera);
  copyIdBtn.addEventListener("click", copyMyId);
  connectBtn.addEventListener("click", startConnectionRequest);
  hangupBtn.addEventListener("click", hangUp);
  tapPlayBtn.addEventListener("click", forcePlayRemote);
  acceptCallBtn.addEventListener("click", acceptIncomingCall);
  declineCallBtn.addEventListener("click", declineIncomingCall);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function debugStatus(message) {
  console.log(message);
  statusEl.textContent = message;
}

function showLocalVideo(show) {
  localVideo.style.display = show ? "block" : "none";
  localPlaceholder.style.display = show ? "none" : "flex";
}

function showRemoteVideo(show) {
  remoteVideo.style.display = show ? "block" : "none";
  remotePlaceholder.style.display = show ? "none" : "flex";
}

function showTapPlay(show) {
  tapPlayBtn.style.display = show ? "block" : "none";
}

function showIncomingModal(show) {
  incomingCallModal.style.display = show ? "flex" : "none";
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
    debugStatus("Peer ready. ID assigned: " + idValue);
  });

  peer.on("call", (incomingCall) => {
    console.log("Incoming connection request from:", incomingCall.peer);
    pendingIncomingCall = incomingCall;
    callerIdEl.textContent = incomingCall.peer;
    showIncomingModal(true);
    debugStatus("Incoming request received from " + incomingCall.peer);
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    debugStatus("Peer error: " + (err.type || "unknown"));
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

    showLocalVideo(true);
    debugStatus("Camera started successfully.");
  } catch (err) {
    console.error("Camera error:", err);
    debugStatus("Could not start camera.");
    alert("Could not access camera and microphone.");
  }
}

function startConnectionRequest() {
  const remoteId = remoteIdInput.value.trim();

  if (!remoteId) {
    alert("Paste a remote ID first.");
    return;
  }

  if (!peer) {
    alert("Peer is not ready yet.");
    return;
  }

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  debugStatus("Sending connection request to " + remoteId + "...");

  try {
    if (localStream) {
      currentCall = peer.call(remoteId, localStream, {
        metadata: { wantsConnection: true }
      });
    } else {
      currentCall = peer.call(remoteId, undefined, {
        metadata: { wantsConnection: true }
      });
    }

    attachCallEvents(currentCall);
  } catch (err) {
    console.error("Connection request error:", err);
    debugStatus("Failed to send connection request.");
  }
}

function acceptIncomingCall() {
  if (!pendingIncomingCall) return;

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  currentCall = pendingIncomingCall;
  pendingIncomingCall = null;

  showIncomingModal(false);

  if (localStream) {
    currentCall.answer(localStream);
    debugStatus("Connection accepted with local camera.");
  } else {
    currentCall.answer();
    debugStatus("Connection accepted without local camera.");
  }

  attachCallEvents(currentCall);
}

function declineIncomingCall() {
  if (pendingIncomingCall) {
    pendingIncomingCall.close();
    pendingIncomingCall = null;
  }

  showIncomingModal(false);
  debugStatus("Connection request declined.");
}

function attachCallEvents(call) {
  if (!call) return;

  call.on("stream", (remoteStream) => {
    console.log("Remote stream received");
    pendingRemoteStream = remoteStream;
    attachRemoteStream(remoteStream);
  });

  call.on("close", () => {
    console.log("Call closed");
    clearRemote();
    showIncomingModal(false);
    pendingIncomingCall = null;
    debugStatus("Connection ended.");
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    debugStatus("Call error.");
  });
}

function attachRemoteStream(stream) {
  remoteVideo.srcObject = stream;
  remoteVideo.playsInline = true;

  showRemoteVideo(true);

  const playPromise = remoteVideo.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        showTapPlay(false);
        debugStatus("Remote video connected.");
      })
      .catch((err) => {
        console.error("Autoplay blocked:", err);
        showTapPlay(true);
        debugStatus("Remote stream received. Tap the button to start playback.");
      });
  } else {
    debugStatus("Remote video connected.");
  }
}

function forcePlayRemote() {
  if (pendingRemoteStream && !remoteVideo.srcObject) {
    remoteVideo.srcObject = pendingRemoteStream;
  }

  remoteVideo.play()
    .then(() => {
      showTapPlay(false);
      debugStatus("Remote video connected.");
    })
    .catch((err) => {
      console.error("Manual remote playback failed:", err);
      debugStatus("Tap again to start remote playback.");
    });
}

function clearRemote() {
  remoteVideo.srcObject = null;
  pendingRemoteStream = null;
  showRemoteVideo(false);
  showTapPlay(false);
}

function hangUp() {
  if (pendingIncomingCall) {
    pendingIncomingCall.close();
    pendingIncomingCall = null;
  }

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  showIncomingModal(false);
  clearRemote();
  debugStatus("Ready.");
}

async function copyMyId() {
  const myId = myIdEl.textContent;

  if (!myId || myId === "Connecting...") return;

  try {
    await navigator.clipboard.writeText(myId);
    debugStatus("Your ID was copied.");
  } catch (err) {
    console.error("Clipboard error:", err);
    prompt("Copy this ID:", myId);
  }
}

function preloadJoinId() {
  const params = new URLSearchParams(window.location.search);
  const joinId = params.get("join");
  if (joinId) {
    remoteIdInput.value = joinId;
  }
}
