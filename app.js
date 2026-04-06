let peer;
let localStream;
let currentCall = null;

// START
window.onload = async () => {
    await setupMedia();
    setupPeer();
};

// GET CAMERA + MIC
async function setupMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = localStream;
    await localVideo.play();
}

// INIT PEER
function setupPeer() {
    const id = "user-" + Math.random().toString(36).substring(2, 7);

    peer = new Peer(id);

    peer.on("open", (id) => {
        document.getElementById("my-id").innerText = id;
        console.log("My ID:", id);
    });

    // 🔥 IMPORTANT — AUTO ANSWER CALL
    peer.on("call", (call) => {
        console.log("Incoming call");

        if (currentCall) currentCall.close();

        currentCall = call;

        // AUTO ANSWER
        call.answer(localStream);

        call.on("stream", (remoteStream) => {
            console.log("Receiving remote stream");
            setRemoteStream(remoteStream);
        });

        call.on("close", () => {
            clearRemote();
        });
    });
}

// CALL OTHER USER
function startCall() {
    const remoteId = document.getElementById("remote-id").value.trim();
    if (!remoteId) return;

    if (currentCall) currentCall.close();

    const call = peer.call(remoteId, localStream);
    currentCall = call;

    call.on("stream", (remoteStream) => {
        console.log("Connected to remote");
        setRemoteStream(remoteStream);
    });

    call.on("close", () => {
        clearRemote();
    });
}

// SET REMOTE VIDEO
function setRemoteStream(stream) {
    const remoteVideo = document.getElementById("remote-video");

    remoteVideo.srcObject = stream;

    remoteVideo.onloadedmetadata = () => {
        remoteVideo.play();
    };
}

// CLEAR REMOTE
function clearRemote() {
    const remoteVideo = document.getElementById("remote-video");
    remoteVideo.srcObject = null;
}
