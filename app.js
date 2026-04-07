/* ============================================================
   STRIVE-OPS | MOBILE-SAFE 1-ON-1 VIDEO SYSTEM
   ============================================================ */

let peer;
let localStream = null;
let currentCall = null;

window.onload = () => {
  setupPeer();

  const joinBtn = document.getElementById("join-btn");
  joinBtn.addEventListener("click", async () => {
    await setupCamera();
  });

  const params = new URLSearchParams(window.location.search);
  const joinId = params.get("join");
  if (joinId) {
    document.getElementById("remote-id").value = joinId;
  }
};

function setStatus(message) {
  const status = document.getElementById("status");
  if (status) status.innerText = message;
}

async function setupCamera() {
  try {
    setStatus("Requesting camera and microphone access...");

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = localStream;
    await localVideo.play();

    setStatus("Camera and microphone enabled.");
    console.log("Local media ready");
  } catch (err) {
    console.error("Media error:", err);
    setStatus("Could not access camera/microphone.");
    alert("Could not access camera/microphone.");
  }
}

function setupPeer() {
  const id = "user-" + Math.random().toString(36).substring(2, 7);

  peer = new Peer(id, {
    host: "0.peerjs.com",
    port: 443,
    secure: true
  });

  peer.on("open", (id) => {
    document.getElementById("my-id").innerText = id;
    console.log("My ID:", id);
  });

  peer.on("call", (call) => {
    console.log("Incoming call");

    if (!localStream) {
      alert("Tap 'Enable Camera & Mic' first.");
      setStatus("Incoming call blocked until camera/mic is enabled.");
      return;
    }

    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }

    currentCall = call;
    call.answer(localStream);

    call.on("stream", (remoteStream) => {
      console.log("Remote stream received");
      attachRemoteStream(remoteStream);
      setStatus("Connected.");
    });

    call.on("close", () => {
      console.log("Call ended");
      clearRemote();
      setStatus("Call ended.");
    });

    call.on("error", (err) => {
      console.error("Incoming call error:", err);
      setStatus("Incoming call error.");
    });
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    setStatus("Peer connection error.");
  });
}

function startCall() {
  const remoteId = document.getElementById("remote-id").value.trim();

  if (!localStream) {
    alert("Tap 'Enable Camera & Mic' first.");
    setStatus("Enable camera and microphone before calling.");
    return;
  }

  if (!remoteId) {
    alert("Enter remote ID");
    return;
  }

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  setStatus("Calling...");

  const call = peer.call(remoteId, localStream);
  currentCall = call;

  call.on("stream", (remoteStream) => {
    console.log("Connected — receiving remote stream");
    attachRemoteStream(remoteStream);
    setStatus("Connected.");
  });

  call.on("close", () => {
    console.log("Outgoing call closed");
    clearRemote();
    setStatus("Call ended.");
  });

  call.on("error", (err) => {
    console.error("Outgoing call error:", err);
    setStatus("Outgoing call error.");
  });
}

function attachRemoteStream(stream) {
  const remoteVideo = document.getElementById("remote-video");
  if (!remoteVideo) return;

  remoteVideo.srcObject = stream;
  remoteVideo.onloadedmetadata = () => {
    remoteVideo.play().catch((err) => {
      console.error("Remote video play failed:", err);
    });
  };
}

function clearRemote() {
  const remoteVideo = document.getElementById("remote-video");
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
}
