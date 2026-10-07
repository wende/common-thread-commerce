#!/usr/bin/env python3
"""Render a trace-backed race from saved v0.4 runs; never invent browser footage.

Requires Pillow. MP4 additionally requires imageio-ffmpeg. Outputs are ignored.
"""
import argparse
import json
import math
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'glovo/benchmarks/v0.4'
PRODUCTS = ['McDouble', 'McChicken', 'Chocolate shake · small, SUP cup', 'Apple pastry']

def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()

def build_data(out):
    lanes = []
    for number, title, suffix in [(2, 'Luna · bare Glovo', 'ui'), (3, 'Luna · with adapter', 'adapter')]:
        trace = json.loads((SOURCE / f'trace-run-{number}.json').read_text())
        summary = trace['summary']
        start = stamp(summary['startedAt'])
        calls = {c['index']: c for c in trace['calls']}
        def at(index):
            return round(stamp(calls[index]['completedAt']) - start, 3)
        # Counts use returned basket observations, not click dispatch timestamps.
        observations = [(0, 0)] + ([(at(i), count) for i, count in
            [(14, 1), (18, 2), (39, 3), (43, 4), (47, 3), (49, 2), (51, 1), (53, 0)]]
            if number == 2 else [(at(8), 4), (at(11), 0)])
        if number == 2:
            milestones = [(0, 'Agent starts'), (at(4), 'McDonald’s menu loaded'),
                (at(14), 'McDouble confirmed in basket'), (at(18), 'McChicken confirmed in basket'),
                (at(21), 'Locating the chocolate shake'),
                (at(25), 'Chocolate shake dialog opened'), (at(29), 'Inspecting customization controls'),
                (at(34), 'Small size confirmed'), (at(35), 'Selecting the SUP cup'),
                (at(39), 'Shake and SUP cup confirmed'), (at(43), 'All four products confirmed'),
                (at(44), 'Native basket screenshot saved'), (at(46), 'Removing items one by one'),
                (at(53), 'Empty basket confirmed'), (at(54), 'Empty basket screenshot saved'),
                (at(57), 'Writing completion report')]
            proof, empty = at(44), at(54)
        else:
            milestones = [(0, 'Agent starts'), (at(3), 'McDonald’s menu loaded'),
                (at(5), 'Adapter installed'), (at(6), 'Four products found in one search'),
                (at(7), 'Product options prepared'), (at(8), 'All four products added in one batch'),
                (at(9), 'Native basket screenshot saved'), (at(11), 'Batch cleanup complete'),
                (at(12), 'Empty basket screenshot saved'), (at(14), 'Completion report collected')]
            proof, empty = at(9), at(12)
        elapsed = summary['elapsedSeconds']
        milestones.append((elapsed, 'Run complete · basket restored'))
        for kind in ['basket', 'empty']:
            image = Image.open(SOURCE / f'run-{number}-{suffix}-{kind}.png').convert('RGB')
            # Header contains an account name and delivery address. Crop it entirely.
            image.crop((0, 150, image.width, image.height)).save(out / f'run-{number}-{kind}.jpg', quality=90)
        lanes.append(dict(run=number, title=title, elapsed=elapsed, proofAt=proof, emptyAt=empty,
            observations=observations, milestones=milestones,
            calls=[dict(at=round(stamp(c['completedAt'])-start,3), index=c['index']) for c in trace['calls']],
            basketImage=f'run-{number}-basket.jpg', emptyImage=f'run-{number}-empty.jpg',
            source=f'glovo/benchmarks/v0.4/trace-run-{number}.json'))
    data = dict(title='Luna vs Luna · McDonald’s on Glovo', model='gpt-6-luna', reasoning='xhigh',
        date='2026-10-05', adapter='0.4.0', playbackSpeed=20, products=PRODUCTS, lanes=lanes,
        disclosure='Evidence replay, not a screen recording. Recorded tool timestamps and saved screenshots. Runs were sequential; starts aligned for playback. Gaps are preserved at one shared speed. Counts change only after recorded basket confirmation. Screenshots appear at their capture call completion and are held until the next capture; completed lanes show their successful basket screenshot as a result card. This older v0.4 pair differs from the later 3.59× mean comparison. Timing includes setup, cleanup and report writing. No checkout.')
    (out / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    return data

def clock(seconds):
    return f'{int(seconds)//60:02d}:{int(seconds)%60:02d}'

def state(lane, t):
    count = next(c for at, c in reversed(lane['observations']) if at <= t)
    action = next(label for at, label in reversed(lane['milestones']) if at <= t)
    call_count = sum(c['at'] <= t for c in lane['calls'])
    return count, action, call_count

def render(data, out, mp4=False):
    width, height, fps, speed = 1280, 920, 8, data['playbackSpeed']
    total = max(l['elapsed'] for l in data['lanes'])
    fontpath = '/System/Library/Fonts/Supplemental/Arial.ttf'
    fonts = {n: ImageFont.truetype(fontpath, n) for n in [16, 19, 22, 28, 34, 48]}
    photos = {(l['run'], k): Image.open(out / l[f'{k}Image']).convert('RGB') for l in data['lanes'] for k in ['basket', 'empty']}
    writer = None
    if mp4:
        import imageio_ffmpeg
        writer = imageio_ffmpeg.write_frames(str(out/'race.mp4'), (width,height), fps=fps,
            codec='libx264', quality=8, macro_block_size=8, output_params=['-movflags', '+faststart'])
        writer.send(None)
    frames = []
    duration = math.ceil(total / speed * fps)
    for frame in range(duration + 1 + 2*fps):
        t = min(total, frame * speed / fps)
        im = Image.new('RGB', (width, height), '#11171b'); d = ImageDraw.Draw(im)
        def text(x,y,s,size=22,color='#e9f0ed'): d.text((x,y),s,font=fonts[size],fill=color)
        text(30,22,'LUNA vs LUNA',34); text(30,66,'McDonald’s on Glovo · same four-item task',22,'#afc3ba')
        text(960,28,f'{clock(t)} elapsed',28); text(1010,70,'20× playback',19,'#afc3ba')
        for j,lane in enumerate(data['lanes']):
            x=30+j*635; w=605; color='#ffb75b' if j==0 else '#5cdab0'
            lt=min(t,lane['elapsed']); count,action,calls=state(lane,lt)
            d.rounded_rectangle((x,118,x+w,844),radius=18,fill='#1d292c')
            text(x+20,138,lane['title'],28,color)
            text(x+20,177,f'{clock(lt)} / {clock(lane["elapsed"])}',48)
            text(x+20,236,action,19)
            d.rounded_rectangle((x+20,273,x+w-20,281),radius=4,fill='#344448')
            end=x+20+(w-40)*lt/lane['elapsed']
            if end>x+20:d.rounded_rectangle((x+20,273,end,281),radius=4,fill=color)
            text(x+20,298,f'{count} items confirmed · {calls} tool calls completed',19,'#afc3ba')
            if lt < lane['proofAt']:
                text(x+20,352,'BASKET STATE FROM TRACE',16,'#afc3ba')
                for i,p in enumerate(PRODUCTS):
                    yy=403+i*70; present=i<count
                    d.ellipse((x+22,yy,x+44,yy+22),fill=color if present else '#344448')
                    text(x+61,yy-2,p,19,'#e9f0ed' if present else '#91a7a0')
                text(x+20,728,'No saved browser frame at this moment.',19,'#afc3ba')
                text(x+20,758,'This panel reconstructs confirmed basket counts.',16,'#afc3ba')
            else:
                finished = lt>=lane['elapsed']
                kind='basket' if finished else 'empty' if lt>=lane['emptyAt'] else 'basket'
                capture=lane['emptyAt'] if kind=='empty' else lane['proofAt']
                image=photos[(lane['run'],kind)].copy(); image.thumbnail((w-40,440),Image.Resampling.LANCZOS)
                im.paste(image,(x+20+(w-40-image.width)//2,365))
                label='RESULT SCREENSHOT' if finished else 'SAVED SCREENSHOT'
                text(x+20,335,f'{label} · {clock(capture)} · held frame',16,'#afc3ba')
                if lt>=lane['elapsed']:text(x+20,780,'COMPLETE · four items verified, then cleaned',19,color)
        text(30,863,'EVIDENCE REPLAY · saved screenshots + recorded tool timestamps · sequential runs aligned at start',16,'#afc3ba')
        text(30,891,'5 Oct 2026 · Luna xhigh · earlier adapter v0.4.0 · includes setup, cleanup and reporting',16,'#afc3ba')
        if frame==int(130/speed*fps):im.save(out/'poster.jpg',quality=92)
        if writer:writer.send(im.tobytes())
        # GIF samples at 4 fps; same shared 20× time axis.
        if frame%2==0:frames.append(im.quantize(colors=128))
    if writer:writer.close()
    frames[0].save(out/'race.gif',save_all=True,append_images=frames[1:],duration=250,loop=0,optimize=False)
    print(json.dumps(dict(output=str(out),frames=len(frames),playbackSeconds=round(total/speed+2,1),baselineSeconds=data['lanes'][0]['elapsed'],adapterSeconds=data['lanes'][1]['elapsed'])))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'output/glovo-race/historical-v0.4')
    parser.add_argument('--mp4',action='store_true')
    args=parser.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
    render(build_data(args.output),args.output,args.mp4)
