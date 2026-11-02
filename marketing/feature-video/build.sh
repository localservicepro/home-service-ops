#!/usr/bin/env bash
# Builds the feature video in the Higgsfield sandbox. Inputs (already downloaded there):
#   ~/vid/ui/<clip>.mp4      app screen recordings (marketing/feature-video/clips)
#   ~/vid/broll/b<N>.mp4     Higgsfield b-roll (Kling 3.0 Turbo)
#   ~/vid/vo/t<N>.wav, ~/vid/vo2/*.wav   narration (Seed Audio, voice "Callan"), silence trimmed
# Output: ~/vid/home-service-ops-features.mp4
set -euo pipefail
V=~/vid
P=$V/proj2
mkdir -p $P/media $V/music2
cp $V/edit.jsx $P/
cd $V

# ---- App clips: one demo cycle each, ending on its payoff, held to the scene length (no loops) ----
clip() { # name src out_dur [segments...] -- segment = start:end[:speed]
  local name=$1 src=$2 dur=$3; shift 3
  local i=0 parts="" inputs="" files=""
  for seg in "$@"; do
    IFS=: read -r a b k <<<"$seg"; k=${k:-1}
    files+=" -i ui/$src.mp4"
    parts+="[$i:v]trim=$a:$b,setpts=(PTS-STARTPTS)*$k,fps=30[s$i];"; inputs+="[s$i]"; i=$((i+1))
  done
  ffmpeg -v error -y $files -filter_complex "${parts}${inputs}concat=n=$i:v=1:a=0,scale=iw*2:ih*2:flags=lanczos,tpad=stop_mode=clone:stop_duration=20[v]" \
    -map "[v]" -t $dur -c:v libx264 -crf 14 -pix_fmt yuv420p $P/media/$name.mp4
}
clip hero      hero      7.41  0:7.41
clip leadform  leadform  13.15 0:6.0 9.0:15.43
clip pipeline  pipeline  8.39  0:6.6
clip quote     quote     10.29 0:6.95:1.25
clip schedule  schedule  4.95  2.0:6.95
clip crew      crew      9.81  0:7.9:1.15
clip pay       pay       9.85  0:4.9:1.4
clip crm       crm       5.6   2.8:8.4

# ---- B-roll: normal speed, 30 fps ----
ffmpeg -v error -y -i broll/b0.mp4 -an -vf "fps=30,scale=1920:1080" -c:v libx264 -crf 16 -pix_fmt yuv420p $P/media/b0.mp4
ffmpeg -v error -y -i broll/b1.mp4 -an -vf "setpts=PTS/0.84,fps=30,scale=1920:1080" -c:v libx264 -crf 16 -pix_fmt yuv420p $P/media/b1.mp4
for i in 2 3 4 5 6 7 8; do cp broll/b${i}s.mp4 $P/media/b$i.mp4; done

# ---- Picture ----
cd $P
# The first build creates the project; fonts are registered into it, then it builds again with them.
higgsedit build edit.jsx > build.log 2>&1
higgsedit fonts add . Inter:400 Inter:600 Inter:700 Inter:900 "JetBrains Mono:400" >/dev/null
higgsedit build edit.jsx > build.log 2>&1
higgsedit render . --out renders/picture.mp4 --quality final > render.log 2>&1

# ---- Narration track: clean takes at their scene times ----
cd $V
declare -a VO=(
  "vo2/c0f.wav 0.50"   # You started your business to do great work. Not to drown in paperwork.
  "vo/t1.wav 5.89"     # Quotes on scraps of paper...
  "vo/t2.wav 12.92"    # Meet Home Service Ops...
  "vo/t3.wav 20.33"    # It starts on your website...
  "vo/t4.wav 33.48"    # Every lead drops into your pipeline...
  "vo/t5.wav 41.87"    # Build a professional quote...
  "vo/t6.wav 55.66"    # Book it on the schedule...
  "vo2/t2.wav 63.11"   # Your crew get their own app...
  "vo2/t4.wav 66.95"   # One tap for directions...
  "vo2/t7.wav 73.27"   # And you can see who's on the job, live.
  "vo/t8.wav 79.12"    # Then get paid, faster...
  "vo2/t8.wav 94.27"   # Text your clients from one shared inbox...
  "vo/t10.wav 102.47"  # Home Service Ops. Less admin. More jobs...
)
IN=""; F=""; MIX=""; i=0
for row in "${VO[@]}"; do
  set -- $row; ms=$(python3 -c "print(int($2*1000))")
  IN+=" -i $1"; F+="[$i:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[v$i];"; MIX+="[v$i]"; i=$((i+1))
done
ffmpeg -v error -y $IN -filter_complex "${F}${MIX}amix=inputs=$i:normalize=0:dropout_transition=0,apad=whole_dur=117.92[vo]" -map "[vo]" -t 117.92 music2/vo_track.wav

# ---- Music: arranged stems, reverb on pads and keys, mixed and ducked under the voice ----
python3 /home/user/vid/music.py /home/user/vid/timing.json music2
cd music2
sox pads.wav pads_r.wav reverb 60 50 90 100 20
sox keys.wav keys_r.wav reverb 45 50 70 100 15
ffmpeg -v error -y -i pads_r.wav -i keys_r.wav -i bass.wav -i drums.wav -i fx.wav -filter_complex \
  "[0:a]volume=0.9[a];[1:a]volume=0.8[b];[2:a]volume=0.9[c];[3:a]volume=0.75[d];[4:a]volume=0.9[e];[a][b][c][d][e]amix=inputs=5:normalize=0,atrim=0:117.92[m]" -map "[m]" music.wav
ffmpeg -v error -y -i vo_track.wav -i music.wav -filter_complex \
  "[1:a]volume=0.55[m];[0:a]asplit=2[sc][vo];[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=450[md];[vo][md]amix=inputs=2:normalize=0,afade=t=out:st=116.6:d=1.3,loudnorm=I=-14:TP=-1.5:LRA=11[a]" \
  -map "[a]" -ar 48000 -t 117.92 final_audio.wav
cd $V
ffmpeg -v error -y -i proj2/renders/picture.mp4 -i music2/final_audio.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart home-service-ops-features-v2.mp4
ffprobe -v error -show_entries format=duration,size -of csv=p=0 home-service-ops-features-v2.mp4
echo FINISHED
