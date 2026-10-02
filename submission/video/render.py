"""Local Sourcebrief evidence-film renderer. Never captures UI or calls a network.

Genuine native PNG/JPEG inputs only; no synthetic UI, no upscaling, no fake cursor. The
storyboard and image modes must be manually reconciled before --assets-reviewed.
Uses installed Pillow, imageio_ffmpeg, Windows speech and system fonts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import wave

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

BASE = Path(__file__).resolve().parent
WORK = BASE / '.work'
POSTERS = BASE / 'posters'
W, H, FPS, RATE = 1920, 1080, 30, 22050
SPF = RATE // FPS
FONT_DIR = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
COLORS = {'page':'#f5f3ec', 'paper':'#fffef9', 'ink':'#20241f', 'muted':'#596154',
          'line':'#c8cbbf', 'blue':'#263db7', 'tint':'#e9edff'}


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def execute(args, log):
    result = subprocess.run([str(a) for a in args], cwd=BASE, text=True, encoding='utf-8',
                            errors='replace', capture_output=True,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    Path(log).write_text(result.stdout + result.stderr, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(f'Local process failed ({result.returncode}); inspect {log}.\n{result.stderr[-2500:]}')
    return result


def font(size, style='regular'):
    names = {'regular':'segoeui.ttf', 'bold':'segoeuib.ttf', 'editorial':'georgia.ttf', 'mono':'consola.ttf'}
    return ImageFont.truetype(str(FONT_DIR / names[style]), size)


def timestamp(frame):
    ms = round(frame * 1000 / FPS)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'


def read_story():
    story = json.loads((BASE / 'storyboard.json').read_text(encoding='utf-8'))
    if (story['width'], story['height'], story['fps']) != (W,H,FPS):
        raise ValueError('This renderer requires the specified 1080p/30 geometry.')
    if story['max_seconds'] > 180:
        raise ValueError('Maximum runtime must not exceed three minutes.')
    for scene in story['scenes']:
        if not scene['id'].replace('-', '').isalnum():
            raise ValueError('Unsafe scene identifier.')
        for caption in scene['captions']:
            if not caption.strip() or len(caption.split()) > 8:
                raise ValueError(f'Caption must contain 1–8 words: {caption}')
    return story


def prepare(story):
    WORK.mkdir(exist_ok=True)
    speech = WORK / 'speech'
    speech.mkdir(exist_ok=True)
    clips = [{'file':f'{s["id"]}-{i:02}.wav', 'text':c}
             for s in story['scenes'] for i,c in enumerate(s['captions'])]
    write_json(WORK / 'speech.json', clips)
    powershell = Path(os.environ.get('WINDIR','C:/Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    execute([powershell, '-NoLogo', '-NoProfile', '-NonInteractive', '-File', BASE/'synthesize.ps1',
             '-ManifestPath', WORK/'speech.json', '-OutputDirectory', speech, '-Voice', story['voice']], WORK/'speech.log')
    pcm, timeline, cues = bytearray(), [], []
    cursor = 0
    for source in story['scenes']:
        scene = dict(source)
        start = cursor
        pcm.extend(b'\x00\x00' * SPF * 9)
        cursor += 9
        scene_cues = []
        for i, caption in enumerate(source['captions']):
            wav = speech/f'{source["id"]}-{i:02}.wav'
            with wave.open(str(wav), 'rb') as sound:
                if (sound.getnchannels(),sound.getsampwidth(),sound.getframerate()) != (1,2,RATE):
                    raise ValueError(f'Unexpected PCM format: {wav.name}')
                samples = sound.getnframes()
                data = sound.readframes(samples)
            frames = max(math.ceil(samples / SPF)+6, math.ceil((len(caption.split())*.30+1)*FPS))
            cue = {'text':caption,'start_frame':cursor,'end_frame':cursor+frames,
                   'local_start':(cursor-start)/FPS,'local_end':(cursor+frames-start)/FPS,
                   'speech_seconds':samples/RATE}
            pcm.extend(data)
            pcm.extend(b'\x00\x00' * (frames*SPF-samples))
            cues.append(cue); scene_cues.append(cue); cursor += frames
        padding = max(9, math.ceil(scene['minimum_seconds']*FPS)-(cursor-start))
        pcm.extend(b'\x00\x00' * SPF * padding); cursor += padding
        scene.update(start_frame=start,end_frame=cursor,frames=cursor-start,seconds=(cursor-start)/FPS,cues=scene_cues)
        timeline.append(scene)
    if cursor/FPS > story['max_seconds']:
        raise ValueError(f'Narration requires {cursor/FPS:.2f}s; trim text rather than accelerate it.')
    with wave.open(str(BASE/'sourcebrief-narration.wav'),'wb') as sound:
        sound.setnchannels(1); sound.setsampwidth(2); sound.setframerate(RATE); sound.writeframes(pcm)
    (BASE/'sourcebrief-demo.en.srt').write_text('\n'.join(
        f'{i}\n{timestamp(c["start_frame"])} --> {timestamp(c["end_frame"])}\n{c["text"]}\n'
        for i,c in enumerate(cues,1)),encoding='utf-8')
    result = {'fps':FPS,'duration_seconds':cursor/FPS,'total_frames':cursor,'voice':story['voice'],
              'voice_origin':'Local Windows System.Speech; authorized free fallback',
              'storyboard_sha256':sha(BASE/'storyboard.json'),'scenes':timeline}
    write_json(BASE/'timeline.json',result)
    (BASE/'narration.txt').write_text('\n\n'.join('\n'.join(s['captions']) for s in story['scenes'])+'\n',encoding='utf-8')
    print(f'Prepared {cursor/FPS:.2f}s; {len(cues)} captions; no network calls.',flush=True)
    return result


def page():
    image = Image.new('RGB',(W,H),COLORS['page'])
    draw = ImageDraw.Draw(image)
    # Quiet paper depth; no decorative or fabricated data graphics.
    for y in range(H):
        t = y/H
        draw.line((0,y,W,y),fill=(round(247-4*t),round(246-4*t),round(241-7*t)))
    draw.line((56,54,88,54),fill=COLORS['blue'],width=5)
    draw.text((104,32),'SOURCEBRIEF',font=font(29,'bold'),fill=COLORS['ink'])
    draw.line((56,77,W-56,77),fill=COLORS['line'],width=1)
    return image


def text(draw, position, value, size, style='regular', color='ink', max_width=None):
    face = font(size,style)
    if max_width is not None and draw.textlength(value,font=face)>max_width:
        raise ValueError(f'Text exceeds designed width: {value}')
    draw.text(position,value,font=face,fill=COLORS[color])


def safe_asset(relative):
    candidate = (BASE/relative).resolve()
    try: candidate.relative_to((BASE/'captures').resolve())
    except ValueError: raise ValueError('Capture must stay within the captures directory.')
    if candidate.suffix.lower() not in ('.png','.jpg','.jpeg') or not candidate.is_file():
        raise ValueError(f'Missing genuine image capture: {candidate}')
    return candidate


def poster(story,scene,index, *, require_asset=True):
    image = page(); draw=ImageDraw.Draw(image)
    text(draw,(W-178,35),f'{index+1:02} / {len(story["scenes"]):02}',24,'mono','muted')
    if scene['kind'] in ('title','close'):
        draw.rounded_rectangle((90,210,W-90,850),radius=18,fill=COLORS['paper'],outline=COLORS['line'],width=1)
        draw.rectangle((90,210,104,850),fill=COLORS['blue'])
        text(draw,(160,282),'PANTA MARKET EVIDENCE',27,'mono','blue')
        heading = ['Before interpretation,','evidence.'] if scene['kind']=='title' else ['Inspect the evidence.']
        for i,line in enumerate(heading): text(draw,(154,370+i*126),line,100,'editorial',max_width=1580)
        text(draw,(160,718),'READ  /  CHECKPOINT  /  COMPARE  /  EXPORT',27,'mono','muted')
        text(draw,(56,918),'Codex-assisted prototype · Powered by Panta',25,color='muted')
        return image, {'kind':scene['kind']}
    text(draw,(56,96),scene['heading'],46,'editorial',max_width=1808)
    text(draw,(56,160),story['mode_label'],23,'mono','blue',max_width=1808)
    path = safe_asset(scene['asset'])
    original=Image.open(path)
    if original.format not in ('PNG','JPEG'): raise ValueError('Unsupported native capture format.')
    source_format=original.format
    original=original.convert('RGB')
    original_size=original.size
    crop=scene.get('crop',[0,0,*original.size])
    if len(crop)!=4 or any(not isinstance(v,int) for v in crop) or not (0<=crop[0]<crop[2]<=original.width and 0<=crop[1]<crop[3]<=original.height):
        raise ValueError(f'Invalid original-pixel crop for {scene["id"]}')
    cropped=original.crop(tuple(crop))
    stage_left=56 if not scene.get('callout') else 834
    stage_width=1808 if not scene.get('callout') else 1030
    scale=min(1.,stage_width/cropped.width,740/cropped.height)
    size=(max(1,round(cropped.width*scale)),max(1,round(cropped.height*scale)))
    if size[0]>cropped.width or size[1]>cropped.height: raise ValueError('Upscaling is forbidden.')
    if scale<1: cropped=cropped.resize(size,Image.Resampling.LANCZOS)
    left=stage_left+(stage_width-size[0])//2; top=206+(740-size[1])//2
    if scene.get('callout'):
        draw.line((74,300,130,300),fill=COLORS['blue'],width=5)
        text(draw,(74,337),'THE REVIEW WORKFLOW',25,'mono','blue',max_width=700)
        for i,line in enumerate(scene['callout']):
            text(draw,(68,404+i*86),line,63,'editorial',max_width=730)
        text(draw,(74,741),'Evidence, kept in context.',28,color='muted',max_width=700)
    shadow=Image.new('RGBA',(W,H),(0,0,0,0)); sd=ImageDraw.Draw(shadow)
    sd.rounded_rectangle((left-4,top-4,left+size[0]+4,top+size[1]+12),radius=9,fill=(32,36,31,35))
    image=Image.alpha_composite(image.convert('RGBA'),shadow.filter(ImageFilter.GaussianBlur(12))).convert('RGB')
    draw=ImageDraw.Draw(image)
    draw.rectangle((left-2,top-2,left+size[0]+1,top+size[1]+1),fill=COLORS['line'])
    image.paste(cropped,(left,top))
    draw=ImageDraw.Draw(image)
    text(draw,(56,952),story['presentation_label'],21,color='muted',max_width=1808)
    return image, {'kind':'capture','file':scene['asset'],'sha256':sha(path),'source_format':source_format,'source_dimensions':list(original_size),
                   'crop':crop,'rendered_dimensions':list(size),'scale':scale,'position':[left,top],
                   'upscaled':False}


def posters(story, *, title_only=False):
    POSTERS.mkdir(exist_ok=True); records=[]; thumbs=[]
    for index,scene in enumerate(story['scenes']):
        if title_only and scene['kind']=='capture': continue
        image,record=poster(story,scene,index)
        out=POSTERS/f'{index+1:02}-{scene["id"]}.png'; image.save(out)
        record.update(scene_id=scene['id'],poster=out.name,poster_sha256=sha(out)); records.append(record)
        thumb=image.resize((640,360),Image.Resampling.LANCZOS); thumbs.append(thumb)
    columns=2; rows=math.ceil(len(thumbs)/columns)
    sheet=Image.new('RGB',(columns*640,rows*360),COLORS['page'])
    for i,thumb in enumerate(thumbs): sheet.paste(thumb,((i%columns)*640,(i//columns)*360))
    sheet.save(POSTERS/('title-sheet.jpg' if title_only else 'contact-sheet.jpg'),quality=94)
    write_json(POSTERS/('title-manifest.json' if title_only else 'manifest.json'),records)
    return records


def render(story,timeline):
    if sha(BASE/'storyboard.json')!=timeline['storyboard_sha256']:
        raise ValueError('Storyboard changed after narration. Run --prepare again.')
    records=posters(story)
    ffmpeg=Path(imageio_ffmpeg.get_ffmpeg_exe())
    shutil.copyfile(FONT_DIR/'segoeui.ttf',WORK/'caption.ttf')
    segments=[]
    for index,scene in enumerate(timeline['scenes']):
        # Capture remains still and unaltered; gentle whole-frame transitions only.
        filters=['drawbox=x=56:y=990:w=1808:h=64:color=0xe9edff:t=fill']
        for cue_index,cue in enumerate(scene['cues']):
            caption_path=WORK/f'{scene["id"]}-caption-{cue_index}.txt'
            caption_path.write_text(cue['text'],encoding='utf-8')
            filters.append(f"drawtext=fontfile=.work/caption.ttf:textfile=.work/{caption_path.name}:fontsize=33:fontcolor=0x20241f:x=(w-tw)/2:y=1001:enable='gte(t,{cue['local_start']:.6f})*lt(t,{cue['local_end']:.6f})'")
        filters.extend([f"fade=t=in:st=0:d=0.2:color=0xf5f3ec",f"fade=t=out:st={scene['seconds']-.2:.6f}:d=0.2:color=0xf5f3ec",'format=yuv420p'])
        graph=WORK/f'{scene["id"]}.filter'; graph.write_text(','.join(filters),encoding='utf-8')
        segment=WORK/f'{index+1:02}-{scene["id"]}.mp4'
        print(f'Rendering {index+1}/{len(timeline["scenes"])}: {scene["id"]}',flush=True)
        execute([ffmpeg,'-hide_banner','-y','-loop','1','-framerate',FPS,'-i',POSTERS/f'{index+1:02}-{scene["id"]}.png',
                 '-filter_script:v',graph,'-frames:v',scene['frames'],'-an','-c:v','libx264','-preset','veryfast',
                 '-crf','17','-threads','4','-pix_fmt','yuv420p','-r',FPS,segment],WORK/f'{scene["id"]}.log')
        segments.append(segment)
    concat=WORK/'concat.txt'; concat.write_text('\n'.join(f"file '{p.name}'" for p in segments)+'\n',encoding='utf-8')
    output=BASE/'sourcebrief-demo.mp4'
    execute([ffmpeg,'-hide_banner','-y','-f','concat','-safe','0','-i',concat,'-i',BASE/'sourcebrief-narration.wav',
             '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',
             '-t',f'{timeline["duration_seconds"]:.6f}',output],WORK/'mux.log')
    execute([ffmpeg,'-hide_banner','-v','error','-i',output,'-f','null','-'],WORK/'decode-check.log')
    version=execute([ffmpeg,'-version'],WORK/'ffmpeg-version.log').stdout.splitlines()[0]
    # Decode actual final-file frames for legibility review, not just source posters.
    qa_dir=BASE/'qa'; qa_dir.mkdir(exist_ok=True); qa_images=[]; qa_thumbs=[]
    for index,scene in enumerate(timeline['scenes']):
        at=(scene['start_frame']+scene['frames']//2)/FPS
        frame=qa_dir/f'{index+1:02}-{scene["id"]}-final.png'
        execute([ffmpeg,'-hide_banner','-y','-ss',f'{at:.6f}','-i',output,'-frames:v','1',frame],
                WORK/f'{scene["id"]}-qa.log')
        qa_images.append({'scene_id':scene['id'],'at_seconds':at,'file':str(frame.relative_to(BASE)),
                          'sha256':sha(frame)})
        qa_thumbs.append(Image.open(frame).convert('RGB').resize((640,360),Image.Resampling.LANCZOS))
    qa_sheet=Image.new('RGB',(1280,math.ceil(len(qa_thumbs)/2)*360),COLORS['page'])
    for i,thumb in enumerate(qa_thumbs): qa_sheet.paste(thumb,((i%2)*640,(i//2)*360))
    qa_sheet.save(qa_dir/'final-contact-sheet.jpg',quality=94)
    receipt={'status':'rendered_and_decoded_local','file':output.name,'sha256':sha(output),'bytes':output.stat().st_size,
             'dimensions':[W,H],'fps':FPS,'duration_seconds':timeline['duration_seconds'],
             'storyboard_sha256':sha(BASE/'storyboard.json'),'narration_sha256':sha(BASE/'sourcebrief-narration.wav'),
             'voice':timeline['voice'],'voice_origin':timeline['voice_origin'],'ffmpeg':version,'inputs':records,
             'decoded_final_frames':qa_images,
             'presentation':'Actual browser screenshots, selected states; not uninterrupted capture',
             'visual_and_audio_final_review':'pending operator review','published':False}
    write_json(BASE/'render-receipt.json',receipt)
    print(f'Final local output: {output}\n{timeline["duration_seconds"]:.2f}s; {output.stat().st_size/1024/1024:.1f} MiB.',flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--prepare',action='store_true'); parser.add_argument('--posters',action='store_true')
    parser.add_argument('--render',action='store_true'); parser.add_argument('--assets-reviewed',action='store_true')
    args=parser.parse_args(); story=read_story(); WORK.mkdir(exist_ok=True)
    if args.prepare:
        prepare(story); posters(story,title_only=True)
    if args.posters: posters(story)
    if args.render:
        if not args.assets_reviewed: parser.error('Internal asset/mode/legibility review is required before render.')
        timeline=json.loads((BASE/'timeline.json').read_text(encoding='utf-8'))
        render(story,timeline)
    if not (args.prepare or args.posters or args.render): parser.print_help()


if __name__=='__main__': main()
