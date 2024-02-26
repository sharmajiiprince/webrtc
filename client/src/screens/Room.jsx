import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";
import RecordRTC from "recordrtc";
import { useReactMediaRecorder } from "react-media-recorder";
import { Button } from "react-bootstrap";
import "../App.css";
const RoomPage = () => {
  const socket = useSocket();
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  let screenRecorder = null;

  const { status, startRecording, stopRecording, mediaBlobUrl } =
    useReactMediaRecorder({
      audio: true,
      video: true,
      screen: true,
    });

  const handleUserJoined = useCallback(({ email, id }) => {
    console.log(`Email ${email} joined room`);
    setRemoteSocketId(id);
  }, []);

  const handleCallUser = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      const offer = await peer.getOffer();
      socket.emit("user:call", { to: remoteSocketId, offer });
      setMyStream(stream);
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  }, [remoteSocketId, socket]);

  const handleIncommingCall = useCallback(
    async ({ from, offer }) => {
      try {
        setRemoteSocketId(from);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        setMyStream(stream);
        console.log(`Incoming Call`, from, offer);
        const ans = await peer.getAnswer(offer);
        socket.emit("call:accepted", { to: from, ans });
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    },
    [socket]
  );

  const sendStreams = useCallback(() => {
    for (const track of myStream.getTracks()) {
      peer.peer.addTrack(track, myStream);
    }
  }, [myStream]);

  const toggleVideoMute = () => {
    const videoTrack = myStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoMuted(!videoTrack.enabled);
  };

  const toggleAudioMute = () => {
    const audioTrack = myStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    setIsAudioMuted(!audioTrack.enabled);
  };

  const toggleScreenRecording = () => {
    if (!isScreenRecording) {
      screenRecorder = new RecordRTC(myStream, {
        type: "video",
        mimeType: "video/webm",
      });
      screenRecorder.startRecording();
    } else if (screenRecorder) {
      screenRecorder.stopRecording(() => {
        console.log("Recording stopped");
        const videoBlob = screenRecorder.getBlob();
        const videoUrl = URL.createObjectURL(videoBlob);
        const a = document.createElement("a");
        document.body.appendChild(a);
        a.href = videoUrl;
        a.download = "screen_recording.webm";
        a.click();
        document.body.removeChild(a);
      });
    }

    setIsScreenRecording(!isScreenRecording);
  };

  const toggleScreenSharing = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        for (const track of screenStream.getTracks()) {
          peer.peer.addTrack(track, screenStream);
        }

        setMyStream(screenStream);
      } else {
        myStream.getTracks().forEach((track) => track.stop());
      }

      setIsScreenSharing(!isScreenSharing);
    } catch (error) {
      console.error("Error sharing screen:", error);
    }
  };

  const handleCallAccepted = useCallback(
    ({ from, ans }) => {
      peer.setLocalDescription(ans);
      console.log("Call Accepted!");
      sendStreams();
    },
    [sendStreams]
  );

  const handleNegoNeeded = useCallback(async () => {
    const offer = await peer.getOffer();
    socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
  }, [remoteSocketId, socket]);

  useEffect(() => {
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
    return () => {
      peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
    };
  }, [handleNegoNeeded]);

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }) => {
      const ans = await peer.getAnswer(offer);
      socket.emit("peer:nego:done", { to: from, ans });
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(async ({ ans }) => {
    await peer.setLocalDescription(ans);
  }, []);

  useEffect(() => {
    peer.peer.addEventListener("track", async (ev) => {
      const remoteStream = ev.streams;
      console.log("GOT TRACKS!!");
      setRemoteStream(remoteStream[0]);
    });
  }, []);

  useEffect(() => {
    socket.on("user:joined", handleUserJoined);
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);

    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("incomming:call", handleIncommingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncomming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
    };
  }, [
    socket,
    handleUserJoined,
    handleIncommingCall,
    handleCallAccepted,
    handleNegoNeedIncomming,
    handleNegoNeedFinal,
  ]);

  return (
    <div className="container">
      <h1>Room Page</h1>
      <h4>{remoteSocketId ? "Connected" : "No one in room"}</h4>
      {myStream && (
        <Button variant="warning" onClick={sendStreams}>
          Send Stream
        </Button>
      )}
      {remoteSocketId && (
        <Button variant="success" onClick={handleCallUser}>
          CALL
        </Button>
      )}
      {myStream && (
        <>
          <p>{status}</p>
          <div className="d-flex flex-wrap justify-content-between">
            <div className="mb-2">
              <Button variant="primary" onClick={toggleVideoMute}>
                {isVideoMuted ? "Unmute Video" : "Mute Video"}
              </Button>
            </div>
            <div className="mb-2">
              <Button variant="secondary" onClick={toggleAudioMute}>
                {isAudioMuted ? "Unmute Audio" : "Mute Audio"}
              </Button>
            </div>
            <div className="mb-2">
              <Button variant="success" onClick={toggleScreenSharing}>
                {isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
              </Button>
            </div>
            <div className="mb-2">
              <Button variant="warning" onClick={startRecording}>
                Start Recording
              </Button>
            </div>
            <div className="mb-2">
              <Button variant="danger" onClick={stopRecording}>
                Stop Recording
              </Button>
            </div>
          </div>

          <h1>My Stream</h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ReactPlayer
              playing
              muted={isVideoMuted}
              height="500px"
              width="600px"
              url={myStream}
              controls
            />
          </div>
          <h1>Recorded vedio</h1>
          <video
            src={mediaBlobUrl}
            className="video"
            style={{ width: "200px", height: "200px" }}
            controls
          />
        </>
      )}
      {remoteStream && (
        <>
          <h1>Remote Stream</h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ReactPlayer
              playing
              muted={isAudioMuted}
              height="200px"
              width="300px"
              url={remoteStream}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default RoomPage;

// import React, { useEffect, useCallback, useState } from "react";
// import ReactPlayer from "react-player";
// import peer from "../service/peer";
// import { useSocket } from "../context/SocketProvider";
// import RecordRTC from "recordrtc";

// const RoomPage = () => {
//   const socket = useSocket();
//   const [remoteSocketId, setRemoteSocketId] = useState(null);
//   const [myStream, setMyStream] = useState();
//   const [remoteStream, setRemoteStream] = useState();
//   const [isVideoMuted, setIsVideoMuted] = useState(false);
//   const [isAudioMuted, setIsAudioMuted] = useState(false);
//   const [isScreenSharing, setIsScreenSharing] = useState(false);
//   const [isScreenRecording, setIsScreenRecording] = useState(false);
//   let screenRecorder = null;

//   const handleUserJoined = useCallback(({ email, id }) => {
//     console.log(`Email ${email} joined room`);
//     setRemoteSocketId(id);
//   }, []);

//   const handleCallUser = useCallback(async () => {
//     const stream = await navigator.mediaDevices.getUserMedia({
//       audio: true,
//       video: true,
//     });
//     const offer = await peer.getOffer();
//     socket.emit("user:call", { to: remoteSocketId, offer });
//     setMyStream(stream);
//   }, [remoteSocketId, socket]);

//   const handleIncommingCall = useCallback(
//     async ({ from, offer }) => {
//       setRemoteSocketId(from);
//       const stream = await navigator.mediaDevices.getUserMedia({
//         audio: true,
//         video: true,
//       });
//       setMyStream(stream);
//       console.log(`Incoming Call`, from, offer);
//       const ans = await peer.getAnswer(offer);
//       socket.emit("call:accepted", { to: from, ans });
//     },
//     [socket]
//   );

//   const sendStreams = useCallback(() => {
//     for (const track of myStream.getTracks()) {
//       peer.peer.addTrack(track, myStream);
//     }
//   }, [myStream]);

//   const toggleVideoMute = () => {
//         const videoTrack = myStream.getVideoTracks()[0];
//         videoTrack.enabled = !videoTrack.enabled;
//         setIsVideoMuted(!videoTrack.enabled);
//       };

//   const toggleAudioMute = () => {
//         const audioTrack = myStream.getAudioTracks()[0];
//         audioTrack.enabled = !audioTrack.enabled;
//         setIsAudioMuted(!audioTrack.enabled);
//       };

//   const toggleScreenRecording = () => {
//     if (!isScreenRecording) {
//       screenRecorder = new RecordRTC(myStream, {
//         type: "video",
//         mimeType: "video/webm",
//       });
//       screenRecorder.startRecording();
//     } else if (screenRecorder) {
//       screenRecorder.stopRecording(() => {
//         console.log("Recording stopped");
//         const videoBlob = screenRecorder.getBlob();
//         const videoUrl = URL.createObjectURL(videoBlob);
//         const a = document.createElement("a");
//         document.body.appendChild(a);
//         //a.style = "display: none";
//         a.href = videoUrl;
//         a.download = "screen_recording.webm";
//         a.click();
//         document.body.removeChild(a);
//       });
//     }

//     setIsScreenRecording(!isScreenRecording);
//   };

//       const toggleScreenSharing = async () => {
//         try {
//           if (!isScreenSharing) {
//             const screenStream = await navigator.mediaDevices.getDisplayMedia({
//               video: true,
//               audio: true,
//             });

//             for (const track of screenStream.getTracks()) {
//               peer.peer.addTrack(track, screenStream);
//             }

//             setMyStream(screenStream);
//           } else {

//             myStream.getTracks().forEach((track) => track.stop());

//           }

//           setIsScreenSharing(!isScreenSharing);
//         } catch (error) {
//           console.error("Error sharing screen:", error);
//         }
//       };

//   const handleCallAccepted = useCallback(
//     ({ from, ans }) => {
//       peer.setLocalDescription(ans);
//       console.log("Call Accepted!");
//       sendStreams();
//     },
//     [sendStreams]
//   );

//   const handleNegoNeeded = useCallback(async () => {
//     const offer = await peer.getOffer();
//     socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
//   }, [remoteSocketId, socket]);

//   useEffect(() => {
//     peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
//     return () => {
//       peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
//     };
//   }, [handleNegoNeeded]);

//   const handleNegoNeedIncomming = useCallback(
//     async ({ from, offer }) => {
//       const ans = await peer.getAnswer(offer);
//       socket.emit("peer:nego:done", { to: from, ans });
//     },
//     [socket]
//   );

//   const handleNegoNeedFinal = useCallback(async ({ ans }) => {
//     await peer.setLocalDescription(ans);
//   }, []);

//   useEffect(() => {
//     peer.peer.addEventListener("track", async (ev) => {
//       const remoteStream = ev.streams;
//       console.log("GOT TRACKS!!");
//       setRemoteStream(remoteStream[0]);
//     });
//   }, []);

//   useEffect(() => {
//     socket.on("user:joined", handleUserJoined);
//     socket.on("incomming:call", handleIncommingCall);
//     socket.on("call:accepted", handleCallAccepted);
//     socket.on("peer:nego:needed", handleNegoNeedIncomming);
//     socket.on("peer:nego:final", handleNegoNeedFinal);

//     return () => {
//       socket.off("user:joined", handleUserJoined);
//       socket.off("incomming:call", handleIncommingCall);
//       socket.off("call:accepted", handleCallAccepted);
//       socket.off("peer:nego:needed", handleNegoNeedIncomming);
//       socket.off("peer:nego:final", handleNegoNeedFinal);
//     };
//   }, [
//     socket,
//     handleUserJoined,
//     handleIncommingCall,
//     handleCallAccepted,
//     handleNegoNeedIncomming,
//     handleNegoNeedFinal,
//   ]);

//   return (
//     <div>
//       <h1>Room Page</h1>
//       <h4>{remoteSocketId ? "Connected" : "No one in room"}</h4>
//       {myStream && <button onClick={sendStreams}>Send Stream</button>}
//       {remoteSocketId && <button onClick={handleCallUser}>CALL</button>}
//       {myStream && (
//         <>
//          <button onClick={toggleVideoMute}>
//              {isVideoMuted ? "Unmute Vedio" : "Mute Vedio"}
//           </button>
//           <button onClick={toggleAudioMute}>
//            {isAudioMuted ? "Unmute Audio" : "Mute Audio"}
//           </button>
//           <button onClick={toggleScreenSharing}>
//             {isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
//           </button>
//           <button onClick={toggleScreenRecording}>
//             {isScreenRecording ? "Stop Recording" : "Start Recording"}
//           </button>
//           <h1>My Stream</h1>
//           <ReactPlayer
//             playing
//             muted={isVideoMuted}
//             height="500px"
//             width="600px"
//             url={myStream}
//           />
//         </>
//       )}
//       {remoteStream && (
//         <>
//           <h1>Remote Stream</h1>
//           <ReactPlayer
//             playing
//             muted={isAudioMuted}
//             height="200px"
//             width="300px"
//             url={remoteStream}
//           />
//         </>
//       )}
//     </div>
//   );
// };

// export default RoomPage;
