import React from 'react';

type Media = { kind: 'image' | 'video'; src?: string; poster?: string; youtubeId?: string };

interface MediaThumbProps {
  media?: Media | null;
  fallbackIcon?: React.ReactNode;
  className?: string;
}

function LinkGlyph() {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.73l-11-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

export function MediaThumb({ media, fallbackIcon, className = '' }: MediaThumbProps) {
  if (!media) {
    return (
      <span className={`lb-thumb ${className}`.trim()} aria-hidden="true">
        {fallbackIcon || <LinkGlyph />}
      </span>
    );
  }

  if (media.kind === 'video' && media.src) {
    return (
      <span className={`lb-thumb lb-thumb-video ${className}`.trim()} aria-hidden="true">
        <video src={media.src} poster={media.poster} autoPlay muted loop playsInline />
        <span className="lb-play">
          <PlayGlyph />
        </span>
      </span>
    );
  }

  if (media.kind === 'video' && media.youtubeId) {
    const src = `https://img.youtube.com/vi/${media.youtubeId}/maxresdefault.jpg`;
    return (
      <span className={`lb-thumb lb-thumb-video ${className}`.trim()} aria-hidden="true">
        <img src={src} alt="" />
        <span className="lb-play">
          <PlayGlyph />
        </span>
      </span>
    );
  }

  return (
    <span className={`lb-thumb ${className}`.trim()} aria-hidden="true">
      <img src={media.src} alt="" />
    </span>
  );
}
