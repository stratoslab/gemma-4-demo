# go2rtc — RTSP gateway for Stratos Vision

Pulls RTSP streams from IP cameras and republishes them as HLS that the
browser app at https://vision.stratoslab.xyz can play.

## Why is this needed

Browsers cannot play RTSP directly. go2rtc acts as a lightweight gateway:

```
IP Camera  --RTSP-->  go2rtc (local)  --HLS-->  Browser <video>
```

## Run it

**On the same machine as the browser** (simplest):

```bash
cd scripts/go2rtc

# 1. Edit go2rtc.yaml — add your RTSP stream URLs
# 2. Start go2rtc:
docker compose up -d

# 3. Open http://localhost:1984 to see the go2rtc web UI
#    (shows stream list, live preview, debug info)
```

Then in the app:

1. Open https://vision.stratoslab.xyz
2. In the "Connect Stream" box, enter:
   `http://localhost:1984/api/stream.m3u8?src=front_door`
   (replace `front_door` with whatever stream name you defined in go2rtc.yaml)
3. Click **Connect Stream** → HLS playback starts → click **Scan** to analyze frames.

## Why localhost and not LAN IP?

The app is served over HTTPS. Browsers block mixed content — you cannot fetch
`http://192.168.x.x/...` from an HTTPS page. But `http://localhost` and
`http://127.0.0.1` are exempt because they're "potentially trustworthy".

If go2rtc runs on a different LAN machine, you need **local TLS**:

```bash
# On the machine running go2rtc:
mkcert -install
mkcert streams.local 192.168.1.X
# then configure go2rtc's api section:
#   api.tls_listen: :1985
#   api.tls_cert: ./streams.local.pem
#   api.tls_key:  ./streams.local-key.pem
```

Add `streams.local -> 192.168.1.X` to your hosts file, then use
`https://streams.local:1985/api/stream.m3u8?src=...` in the app.

## Configuring cameras

Common RTSP URL patterns:

| Vendor        | URL pattern |
|---------------|-------------|
| Hikvision     | `rtsp://user:pass@ip:554/Streaming/Channels/101` (main) / `102` (sub) |
| Dahua         | `rtsp://user:pass@ip:554/cam/realmonitor?channel=1&subtype=0` |
| Reolink       | `rtsp://user:pass@ip:554/h264Preview_01_main` |
| Amcrest       | same as Dahua |
| Axis          | `rtsp://user:pass@ip:554/axis-media/media.amp` |
| ONVIF-generic | Use go2rtc's `onvif://user:pass@ip` auto-discovery |

For more: see go2rtc's source list in the web UI at http://localhost:1984.

## Tuning HLS latency

Default HLS latency is 2-6 seconds. To reduce:

1. Cameras must send short keyframe intervals (1-2s is ideal).
2. In the app, `hls.js` is already initialized with `lowLatencyMode: true`.

If you need <500ms latency, switch to WebRTC playback (the app's `startHlsStream`
can be extended with a WHEP client — ask Claude to add it).
