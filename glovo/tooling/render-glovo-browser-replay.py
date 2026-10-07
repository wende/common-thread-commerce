#!/usr/bin/env python3
"""Render the browser replay from actual Glovo screenshots."""
import json
import math
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/glovo-race'
data=json.loads((OUT/'data.json').read_text())
assert data['kind']=='browser-capture'
assert all(s['captureType']=='actual browser screenshot' for l in data['lanes'] for s in l['steps'])
assert all(l['steps'][-1]['cart']==[0,1,2,3] and l['steps'][-1]['at']==l['elapsed'] for l in data['lanes'])
fontpath='/System/Library/Fonts/Supplemental/Arial.ttf'
fonts={n:ImageFont.truetype(fontpath,n) for n in [16,18,20,23,28,36,44]}
images={s['image']:Image.open(OUT/s['image']).convert('RGB') for l in data['lanes'] for s in l['steps']}
width,height,fps,speed=1440,900,8,data['playbackSpeed']
total=max(l['elapsed'] for l in data['lanes'])
def clock(s):return f'{int(s)//60:02d}:{s%60:04.1f}'
writer=imageio_ffmpeg.write_frames(str(OUT/'race.mp4'),(width,height),fps=fps,codec='libx264',quality=8,macro_block_size=4,output_params=['-movflags','+faststart'])
writer.send(None)
frames=[]
count=math.ceil(total/speed*fps)
for f in range(count+1+2*fps):
    t=min(total,f*speed/fps)
    im=Image.new('RGB',(width,height),'#11171b');d=ImageDraw.Draw(im)
    def text(x,y,s,size=20,color='#e9f0ed'):d.text((x,y),s,font=fonts[size],fill=color)
    text(24,18,'REAL GLOVO SCREENSHOTS · replay timing is illustrative',18,'#ffb75b')
    text(24,48,'LUNA TASK · GLOVO BROWSER REPLAY',36)
    text(1040,46,'72.1% less time',28,'#5cdab0')
    text(24,95,'Full-task benchmark: 292.7s → 81.6s · McDonald’s · same four-item basket',23,'#afc3ba')
    text(1170,95,'10× playback',20,'#afc3ba')
    for i,l in enumerate(data['lanes']):
        x=24+i*714;w=678;color='#ffb75b' if i==0 else '#5cdab0';lt=min(t,l['elapsed'])
        s=next(s for s in reversed(l['steps']) if s['at']<=lt)
        d.rounded_rectangle((x,150,x+w,770),radius=18,fill='#1d292c')
        text(x+18,170,l['title'],28,color)
        text(x+18,213,f'{clock(lt)} / {clock(l["elapsed"])}',44)
        text(x+18,275,s['label'],20)
        text(x+18,312,f'Step {s["index"]+1}/{len(l["steps"])} · {len(s["cart"])} items · illustrative pacing',18,'#afc3ba')
        d.rounded_rectangle((x+18,348,x+w-18,356),radius=4,fill='#344448')
        end=x+18+(w-36)*lt/l['elapsed']
        if end>x+18:d.rounded_rectangle((x+18,348,end,356),radius=4,fill=color)
        shot=images[s['image']].copy();shot.thumbnail((w-36,340),Image.Resampling.LANCZOS);im.paste(shot,(x+18+(w-36-shot.width)//2,380))
        text(x+18,741,'REAL CHROME CAPTURE · recorded 6 October 2026',16,'#afc3ba')
    text(24,800,'Demo ends at full basket verification · cleanup omitted · all demo step times are illustrative',18,'#afc3ba')
    text(24,834,'72.1% refers to the original full-task benchmark means, which include cleanup and reporting.',18,'#afc3ba')
    text(24,868,'Browser driven by Codex to replay the Luna task · both baskets verified · no checkout',16,'#afc3ba')
    if f==count:im.save(OUT/'poster.jpg',quality=92)
    writer.send(im.tobytes())
    if f%2==0:frames.append(im.quantize(colors=192))
writer.close()
frames[0].save(OUT/'race.gif',save_all=True,append_images=frames[1:],duration=250,loop=0,optimize=False)

steps=[(l,s) for l in data['lanes'] for s in l['steps']]
tile_w,tile_h=480,310
sheet=Image.new('RGB',(tile_w*3,tile_h*math.ceil(len(steps)/3)+70),'#11171b');sd=ImageDraw.Draw(sheet)
sd.text((16,15),f'ACTUAL GLOVO BROWSER SCREENS · all {len(steps)} steps · illustrative pacing',font=fonts[23],fill='#ffb75b')
for i,(l,s) in enumerate(steps):
    x=(i%3)*tile_w+12;y=(i//3)*tile_h+70
    shot=images[s['image']].copy();shot.thumbnail((456,256),Image.Resampling.LANCZOS);sheet.paste(shot,(x,y))
    sd.text((x,y+262),f'{l["key"]} {s["index"]+1:02d} · {s["label"]}',font=fonts[16],fill='#e9f0ed')
sheet.save(OUT/'contact-sheet.jpg',quality=92)
with zipfile.ZipFile(OUT/'steps.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
    z.write(OUT/'data.json','data.json');z.write(OUT/'contact-sheet.jpg','contact-sheet.jpg')
    z.writestr('README.txt',data['disclosure']+'\n\nScreenshot names and labels are listed in data.json.\n')
    for _,s in steps:z.write(OUT/s['image'],s['image'])
print(json.dumps(dict(stepScreenshots=len(steps),speed=speed,demoBaselineSeconds=data['lanes'][0]['elapsed'],demoAdapterSeconds=data['lanes'][1]['elapsed'],benchmarkMeans=data['benchmarkMeans'],reductionPercent=data['measuredReductionPercent'])))
