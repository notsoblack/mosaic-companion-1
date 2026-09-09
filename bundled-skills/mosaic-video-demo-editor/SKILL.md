---
name: mosaic-video-demo-editor
description: "Use when editing MosAIc demo videos with overlays and voice."
---

# MosAIc Video Demo Editor

## Trigger
Use when the user wants to create, edit, or enhance a demo video of MosAIc Companion features — adding text overlays, voice narration, or picture-in-picture effects for Twitter/X, YouTube, or presentations.

## Overview

This skill provides a complete ffmpeg-based workflow for producing professional demo videos of MosAIc Companion's addon features. It includes:

1. **Text Overlay Explainers** — timed text boxes explaining Graph, Loops, AImify, etc.
2. **Twitter/X Teasers** — fast-paced 30-50s clips with bold cinematic text
3. **Voice Narration Mixing** — TTS or cloned voice mixed into video
4. **PFP Picture-in-Picture** — user's profile picture as a small circular overlay
5. **Future: Voice Cloning** — extract voice from user's videos for personalized narration

## Prerequisites

- `ffmpeg` installed (video processing)
- Python 3 (for orchestration scripts)
- Optional: `ffprobe` (comes with ffmpeg)
- Fonts available at `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` or similar

## Step-by-Step Workflow

### Step 1: Prepare Source Video

Compress the source if >50MB (API limit) or for faster processing:

```bash
ffmpeg -i INPUT.mkv -vcodec libx264 -crf 28 -preset fast \
  -vf "scale=1280:-1" -an /tmp/compressed.mp4
```

### Step 2: Extract Key Frames for Analysis

```bash
mkdir -p /tmp/frames
ffmpeg -i /tmp/compressed.mp4 -vf "fps=1/10,scale=800:-1" /tmp/frames/frame_%03d.png
```

### Step 3: Build Full Explainer (Text Overlays)

Use Python + ffmpeg with `-vf` drawtext filters. Build a list of `drawtext` filters with `enable='between(t,start,end)'` for timed appearance.

**Key parameters per segment:**
- `x=(w-text_w)/2` — horizontally centered
- `y=` — vertical position (e.g. `55`, `120`, `h-80`, `(h-text_h)/2`)
- `box=1:boxcolor=0x000000@0.75:boxborderw=10` — semi-transparent black box
- `enable='between(t,28,45)'` — show only during seconds 28-45

**Color palette for MosAIc dark theme:**
| Element | Color | Hex |
|---|---|---|
| Primary accent | Cyan | `#00D4FF` |
| Graph nodes (MCPs) | Purple | `#C77DFF` |
| Graph nodes (Factories) | Orange | `#FF8C42` |
| Loops / Active | Green | `#00FF9D` |
| Subtitle | White | `white` |
| Metadata | Gray | `#A0A0A0` |

**Full explainer segments (typical):**
1. Intro title (0s-7s)
2. The Graph (28s-45s)
3. AImify (48s-64s)
4. Loops (72s-98s)
5. Closing (125s-137s)

**Build command:**
```bash
ffmpeg -y -i INPUT.mp4 -vf "drawtext=... , drawtext=..." \
  -c:v libx264 -preset medium -crf 23 -c:a copy OUTPUT.mp4
```

### Step 4: Build Twitter/X Teaser (Fast-Paced)

Extract key segments as separate clips, add overlays, then concat:

```python
# Python: for each segment
segments = [
    (28, 10, [text_filters]),   # Graph intro
    (38, 7,  [text_filters]),   # Graph detail
    (48, 7,  [text_filters]),   # AImify
    (72, 10, [text_filters]),   # Loops
    (125, 10, [text_filters]),  # Closing
]

# Build each with ffmpeg -ss START -t DURATION -vf "drawtext=..."
# Concatenate with ffmpeg concat demuxer
```

**Teaser text style — BIG and bold:**
- Title: `fontsize=64`, color `#00D4FF`
- Subtitle: `fontsize=56`, color `#C77DFF`
- Metadata: `fontsize=22`, color `#C0C0C0`, position `h-80`

**Add generated end card:**
```bash
ffmpeg -f lavfi -i "color=c=0x0A0A1A:s=1280x720:d=3:r=30" \
  -vf "drawtext=..." -c:v libx264 -an endcard.mp4
```

### Step 5: Generate Voice Narration (TTS)

Use `text_to_speech` tool with the narration script. Recommended settings:
- `speed=0.92` — slightly slower for clarity
- `instructions="Speak in an enthusiastic, energetic tech-demo voice. Like presenting at a developer conference."`
- Output to `/tmp/narration.mp3`

**Twitter teaser narration script (~40s):**
> "Your AI workforce, visualized in real time. HyperCycle Node Factories mapped as a live graph topology. Every node represents a worker. Every edge represents a job. AImify your model. Package Stargate assets as deployable digital workers. Autonomous agent loops. Self-executing workflows where each node is a step and each edge is execution flow. Your AI workforce. Visualized. Orchestrated. Deployed. MosAIc Companion plus Stargate."

**Explainer narration script (~70s):**
> "Welcome to MosAIc Companion's Stargate addon. This is your AI Workforce Command Center. The Graph gives you a live topology view of your HyperCycle Node Factories. Each node represents a worker. Each edge represents a job. Purple nodes are MCPs. Orange nodes are factories. Green means active. AImify lets you package Stargate assets as deployable digital workers. Skills become tools. Loops become workflows. MCPs become service endpoints. Loops are pre-built agent workflows executed as directed graphs. Each node is a step. Each edge is execution flow. Patterns include Deep Research, Code Review with Quality Gates, Auto-Work, and Multi-Agent Orchestration. Your AI workforce. Visualized. Orchestrated. Deployed. MosAIc Companion plus Stargate."

### Step 6: Mix Voice into Video

```bash
ffmpeg -y -i VIDEO.mp4 -i NARRATION.mp3 \
  -c:v copy -c:a aac -b:a 192k -shortest \
  OUTPUT-voiced.mp4
```

`-shortest` ensures the output matches the shorter of video or audio.

### Step 7: Add PFP Picture-in-Picture (Circular)

**Requirements:**
- User's profile picture (square, ideally 200x200+ pixels)
- Saved to workspace (e.g., `/home/mauricio/.hermes/attachments/pfp.png`)

**Resize and create circular PFP:**
```bash
# Resize to 120x120 maintaining aspect ratio
ffmpeg -y -i pfp.png -vf "scale=120:120:force_original_aspect_ratio=decrease" /tmp/pfp_120.png

# Create circular alpha mask
ffmpeg -y -f lavfi -i "color=c=white:s=120x120" -vf "
  format=gray,
  geq=lum='if(lte(hypot(X-59.5,Y-59.5),55),255,0)'
" -update 1 -frames:v 1 /tmp/circle_mask.png

# Apply mask to PFP for circular crop + subtle border
ffmpeg -y -i /tmp/pfp_120.png -i /tmp/circle_mask.png -filter_complex "
  [0:v]format=rgba[img];
  [1:v]format=rgba[mask];
  [img][mask]alphamerge
" -update 1 -frames:v 1 /tmp/pfp_circle.png
```

**Overlay PFP on video (bottom-right corner):**
```bash
ffmpeg -y -i VIDEO.mp4 -loop 1 -i /tmp/pfp_circle.png -filter_complex "
  [1:v]format=rgba[logo];
  [0:v][logo]overlay=W-w-20:H-h-20:format=auto
" -c:v libx264 -preset fast -crf 23 -c:a copy OUTPUT-pfp.mp4
```

**Important:** Use `-t DURATION` on both inputs to prevent the `-loop 1` from running infinitely during encoding.

### Step 8: Voice Cloning with Coqui XTTS

**Install XTTS (one-time setup):**
```bash
python3 -m venv /tmp/tts_venv
source /tmp/tts_venv/bin/activate
pip install coqui-tts torch torchaudio --index-url https://download.pytorch.org/whl/cpu
# Note: May need transformers version adjustments for Python 3.12 compatibility
```

**Extract voice from existing video:**
```bash
# Download audio from YouTube or use local video
ffmpeg -i video_with_voice.mp4 -vn -ar 16000 -ac 1 voice_16k.wav
```

**Clone voice and generate narration:**
```python
from TTS.api import TTS

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)
tts.tts_to_file(
    text="Your narration script here...",
    speaker_wav="/tmp/voice_16k.wav",
    language="en",
    file_path="/tmp/cloned_narration.wav"
)
```

**Pitfall:** Python 3.12 compatibility requires manual patching of TTS/__init__.py and transformers version adjustments. For production, consider using Python 3.11 or ElevenLabs API.

### Step 9: Full Pipeline — Everything Together

```bash
# 1. Build teaser
python3 scripts/build_twitter_teaser.py input.mp4 /tmp/teaser.mp4

# 2. Clone voice narration
python3 clone_voice.py

# 3. Mix voice into teaser
ffmpeg -y -i /tmp/teaser.mp4 -i /tmp/cloned_narration.wav \
  -c:v copy -c:a aac -b:a 192k -shortest /tmp/teaser-voiced.mp4

# 4. Add PFP overlay
ffmpeg -y -i /tmp/teaser-voiced.mp4 -loop 1 -i /tmp/pfp_circle.png \
  -filter_complex "[1:v]format=rgba[logo];[0:v][logo]overlay=W-w-20:H-h-20:format=auto" \
  -c:v libx264 -preset fast -crf 23 -c:a copy -t 40 FINAL.mp4
```

## Twitter/X Post Templates

**Punchy (with video):**
> Your AI workforce. Visualized in real time. 🎬🔊
>
> MosAIc Companion's Stargate addon turns HyperCycle Node Factories into a live graph — every node is a worker, every edge is a job.
>
> Graph topology + autonomous agent loops + deployable digital workers.
>
> #AI #MosAIc #AgenticAI #HyperCycle #BuildInPublic

**Tech-forward:**
> Live graph topology for AI agent networks.
> Node = worker. Edge = job.
> Package as digital workers. Deploy anywhere.
>
> MosAIc Companion + Stargate 🚀
>
> #AIAgents #Stargate #MosAIcCompanion

## Verification

After creating each video, always:
1. Extract a preview frame: `ffmpeg -i video.mp4 -ss 5 -vframes 1 preview.png`
2. Verify text readability with `vision_analyze`
3. Check audio sync: narration should end before or at video end
4. Confirm file size: Twitter supports up to ~512MB, but <50MB uploads faster

## Common Issues & Fixes

| Issue | Cause | Fix |
|---|---|---|
| `Filter not found` | Quoting in filter_complex | Use Python subprocess.run(list) or filter_complex_script file |
| Text shows `\:` | Over-escaping colons | In subprocess list mode, don't escape colons in text values |
| Video too large for API | Original file size | Compress with `-crf 28 -preset fast` |
| Audio cuts off early | Video longer than audio | Use `-shortest` flag |
| Text not centered | x position | Use `x=(w-text_w)/2` for horizontal center |
| PFP has square edges | No alpha mask | Use `geq` filter with hypot distance for circular crop |

## References

- `scripts/build_explainer.py` — Full explainer builder
- `scripts/build_twitter_teaser.py` — Twitter teaser builder
- `scripts/build_pfp_overlay.py` — PFP picture-in-picture overlay
- `templates/narration_script_twitter.txt` — Twitter teaser narration
- `templates/narration_script_explainer.txt` — Full explainer narration
