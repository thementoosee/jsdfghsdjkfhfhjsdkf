import { useEffect, useState, type CSSProperties } from 'react';

/** Twitch CDN default when Helix has no custom profile image. */
export const TWITCH_DEFAULT_AVATAR_URL =
  'https://static-cdn.jtvnw.net/user-default-pictures-uv/13e5fa74-defa-11e9-809c-784f43822e80-profile_image-70x70.png';

export function isMissingOrGenericAvatar(url: string | null | undefined): boolean {
  const u = (url ?? '').trim();
  if (!u) return true;
  if (u === TWITCH_DEFAULT_AVATAR_URL) return true;
  if (/user-default-pictures/i.test(u)) return true;
  return false;
}

/**
 * Circular Twitch profile image with initials / default fallback.
 * Never leaves a broken image — onError hides the img.
 */
export function TwitchAvatar({
  url,
  name,
  size,
  className = '',
  style,
  border,
  boxShadow,
  draggable = false,
}: {
  url: string;
  name: string;
  size: number;
  className?: string;
  style?: CSSProperties;
  border?: string;
  boxShadow?: string;
  draggable?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  const parts = name.split(/[\s_]+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
      : (parts[0] ?? name).slice(0, 2).toUpperCase();

  const showImg = Boolean(url?.trim()) && !failed;

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: '#0f172a',
        border,
        boxShadow,
        ...style,
      }}
    >
      {showImg ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={draggable}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center font-black"
          style={{ color: '#fde68a', fontSize: Math.max(10, Math.round(size * 0.32)) }}
        >
          {initials || '?'}
        </div>
      )}
    </div>
  );
}
