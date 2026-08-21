import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const ffmpeg = path.join(root, "output", "video-tools", "node_modules", "ffmpeg-static", "ffmpeg.exe");
const source = path.join(root, "output", "recording-source", "promo-03-08-session-1786349803591.webm");
const movies = path.join(root, "movies");
const webm = path.join(movies, "05-processing-take08.webm");
const mp4 = path.join(movies, "05-processing-take08.mp4");
const manifest = path.join(movies, "05-processing-take08.json");
// Four real parsing moments from the source session: initial, mid, late, and complete.
const inputs = [[22.319, 6], [62, 6], [103, 6], [141, 7]];
const args = (output, codecArgs, filter) => ["-y", ...inputs.flatMap(([ss, t]) => ["-ss", String(ss), "-t", String(t), "-i", source]), "-filter_complex", filter, "-an", ...codecArgs, output];
const concat = "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0,fps=30";
await run(ffmpeg, args(webm, ["-c:v", "libvpx-vp9", "-crf", "17", "-b:v", "0", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-tile-columns", "2", "-g", "60"], concat), { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
await run(ffmpeg, args(mp4, ["-c:v", "libx264", "-preset", "fast", "-crf", "15", "-profile:v", "high", "-level", "5.1", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-g", "60", "-movflags", "+faststart"], `${concat},scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv`), { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const probe = async (file) => { const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", file, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], { windowsHide: true }).catch((e) => e); const s = /Video:\s*([^,]+).*?,\s*(\d+)x(\d+)[^\r\n]*?(\d+(?:\.\d+)?)\s*fps/.exec(stderr); const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr); const f = await stat(file); return { codec: s?.[1], width:+s?.[2], height:+s?.[3], fps:+s?.[4], durationSeconds:+(+d[1]*3600 + +d[2]*60 + +d[3]).toFixed(3), sizeBytes:f.size, sha256:createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase(), hasAudio:/Audio:/.test(stderr) }; };
const [wm, mm] = await Promise.all([probe(webm), probe(mp4)]);
await writeFile(manifest, JSON.stringify({ section:{id:"05",slug:"processing",title:"AI 解析过程",guide:"docs/APP_PROMO_VIDEO_RECORDING_GUIDE_4MIN.md"}, device:"iPhone 17 Pro / Retina 3x",output:{width:1440,height:2880},frameRate:30,noAudio:true,chromaKey:{color:"#00FF00",outsideShellOnly:true},files:{vp9Webm:webm,h264Mp4:mp4,keyStill:path.join(movies,"05-processing-end-key.png")},sourceSession:source,editing:"从真实解析会话剪出 18%、46%、74%、100% 四个状态；每个跳切后保留 6–7 秒。",video:{webm:wm,mp4:mm},verification:{dimensions:`${mm.width}×${mm.height}`,fps:mm.fps,h264High:/h264/i.test(mm.codec||""),noAudio:!wm.hasAudio&&!mm.hasAudio,chromaKey:"#00FF00",interactionClicks:[]}},null,2)+"\n","utf8");
