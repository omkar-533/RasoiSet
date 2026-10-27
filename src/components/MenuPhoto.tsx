import { ImageOff } from 'lucide-react';
import { useState } from 'react';

export default function MenuPhoto({ src, className = '' }: { src?: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src) && failedSrc === src;
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`} aria-hidden>
        <ImageOff size={18} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={320}
      height={180}
      className={`bg-slate-100 object-cover ${className}`}
      onError={() => setFailedSrc(src)}
    />
  );
}
