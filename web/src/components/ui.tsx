// Small presentational building blocks shared across views.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Artist } from '../../../shared/types.ts';

export function Avatar({ artist }: { artist: Pick<Artist, 'name' | 'image'> }) {
  return artist.image ? (
    <img className="avatar" src={artist.image} alt="" />
  ) : (
    <div className="avatar">{artist.name[0] ?? '?'}</div>
  );
}

export function Cover({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="noart">♪</div>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'up' | 'new' }) {
  return <span className={tone ? `badge ${tone}` : 'badge'}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** Native <dialog> driven by an `open` prop. Clicking the backdrop closes it. */
export function Modal({ open, onClose, wide, children }: { open: boolean; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={wide ? 'wide' : undefined}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && children}
    </dialog>
  );
}
