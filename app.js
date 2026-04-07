let peer;
let localStream = null;
let currentCall = null;
let pendingRemoteStream = null;
let mode = "viewer"; // "host" or "viewer"

window.addEventListener("load", () => {
  initPeer();
  bindUI();
});

function bindUI() {
  document.getElementById("host-btn").addEventListener("click", becomeHost);
  document.getElementById("viewer-btn").addEventListener("click", becomeViewer);
  document.getElementById("join-btn").addEventListener("click", joinHost);
  document.getElementById("hangup-btn").addEventListener("click", hangUp);
  document.getElementById("copy-btn").addEventListener("click", copyMyId);
  document.getElementById("tap-play").addEventListener("click", forcePlayRemote);
}

function setStatus(text) {
  document.getElementById("status").innerText = text;
}

function showLocal(show) {
  document.getElementById("local-video").style.display = show ? "block" : "none";
  document.getElementById("local-placeholder").style.display = show ? "none" : "flex";
}

function showRemote(show) {
  document.getElementById("remote-video").style.display = show ? "block" : "none";
  document.getElementById("remote-placeholder").style.display = show ? "none" : "flex";
}

function showTapPlay(show) {
  document.getElementById("tap-play").style.display = show ? "block" : "none";
}

function initPeer() {
  const id = "svc-" + Math.random().toString(36).substring(2, 8);

  peer = new Peer(id, {
    host: "0.peerjs.com",
    port: 443,
    secure: true
  });

  peer.on("open", (id) => {
    document.getElementById("my-id").innerText = id;
    setStatus("Connected to signaling server.");
  });

  peer.on("call", async (call) => {
    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }

    currentCall = call;

    // Host sends camera. Viewer answers without media.
    if (mode === "host" && localStream) {
      call.answer(localStream);
      setStatus("Viewer connected. Sending live feed.");
    } else {
      call.answer();
      setStatus("Receiving live feed...");
    }

    attachCallEvents(call);
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    setStatus("Peer error: " + (err.type || "unknown"));
  });
}

async function becomeHost() {
  try {
    mode = "host";
    setStatus("Requesting camera and microphone...");

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.playsInline = true;
    await localVideo.play();

    showLocal(true);
    setStatus("You are now the host. Share your Session ID.");
  } catch (err) {
    console.error("Host media error:", err);
    setStatus("Could not access camera/microphone.");
    alert("Could not access camera/microphone.");
  }
}

function becomeViewer() {
  mode = "viewer";

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  const localVideo = document.getElementById("local-video");
  localVideo.srcObject = null;
  showLocal(false);

  setStatus("Viewer mode enabled. Paste a Host ID and click Join Host.");
}

function joinHost() {
  const hostId = document.getElementById("host-id-input").value.trim();

  if (!hostId) {
    alert("Paste a Host ID first.");
    return;
  }

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  setStatus("Joining host...");

  // Viewer calls host without sending media.
  currentCall = peer.call(hostId);
  attachCallEvents(currentCall);
}

function attachCallEvents(call) {
  call.on("stream", (remoteStream) => {
    pendingRemoteStream = remoteStream;
    attachRemoteStream(remoteStream);
  });

  call.on("close", () => {
    clearRemote();
    setStatus("Call ended.");
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    setStatus("Call error.");
  });
}

function attachRemoteStream(stream) {
  const remoteVideo = document.getElementById("remote-video");
  remoteVideo.srcObject = stream;
  remoteVideo.playsInline = true;

  showRemote(true);

  const playPromise = remoteVideo.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        showTapPlay(false);
        setStatus("Live feed connected.");
      })
      .catch((err) => {
        console.error("Autoplay blocked:", err);
        showTapPlay(true);
        setStatus("Tap the button to start the live video.");
      });
  } else {
    setStatus("Live feed connected.");
  }
}

function forcePlayRemote() {
  const remoteVideo = document.getElementById("remote-video");

  if (pendingRemoteStream && !remoteVideo.srcObject) {
    remoteVideo.srcObject = pendingRemoteStream;
  }

  remoteVideo.play()
    .then(() => {
      showTapPlay(false);
      setStatus("Live feed connected.");
    })
    .catch((err) => {
      console.error("Manual play failed:", err);
      setStatus("Tap again to start the live video.");
    });
}

function clearRemote() {
  const remoteVideo = document.getElementById("remote-video");
  remoteVideo.srcObject = null;
  pendingRemoteStream = null;
  showRemote(false);
  showTapPlay(false);
}

function hangUp() {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  clearRemote();
  setStatus("Ready.");
}

async function copyMyId() {
  const myId = document.getElementById("my-id").innerText;

  if (!myId || myId === "Connecting...") return;

  try {
    await navigator.clipboard.writeText(myId);
    setStatus("Session ID copied.");
  } catch (err) {
    console.error("Clipboard error:", err);
    prompt("Copy this Session ID:", myId);
  }
}
