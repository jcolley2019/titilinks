// ProfileShell.jsx — the public profile canvas: hero, identity, socials, bio, block stack.
// Demonstrates the three LinkButton variants in a real profile context.

const { useState: _useState } = React;

function VerifiedBadge() {
  return (
    <svg className="verified" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1l2.4 2.6 3.5.1.3 3.5L20.6 10l-1.9 3 .4 3.5-3.4.9L13.3 20l-3-1.7-3.4.9-1.1-3.4L2.9 13 4 10 2.9 7l2.9-2.1 1.1-3.4 3.4.9L13 0" transform="translate(-1,2) scale(0.9)"/>
      <path d="M9 12l2 2 4-4" stroke="#0e0c09" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SocialIcon({ kind }) {
  const paths = {
    instagram: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
      </>
    ),
    tiktok: (
      <>
        <path d="M16 3v3a4 4 0 0 0 4 4" />
        <path d="M16 3v11a4 4 0 1 1-4-4" />
      </>
    ),
    youtube: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="4" />
        <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
      </>
    ),
    x: (
      <path d="M4 4l16 16M20 4L4 20" />
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </>
    ),
    linkme: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 12h6M12 9v6" />
      </>
    ),
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[kind]}
    </svg>
  );
}

function SocialRow() {
  const kinds = ['instagram', 'tiktok', 'youtube', 'x', 'linkme'];
  return (
    <div className="social-row">
      {kinds.map(k => (
        <button key={k} className="social-btn" aria-label={k}>
          <SocialIcon kind={k} />
        </button>
      ))}
    </div>
  );
}

function ProfileHeader({ image, name, handle, bio }) {
  return (
    <>
      <div className="profile-hero">
        <img src={image} alt="" />
      </div>
      <div className="profile-identity">
        <h1 className="profile-name">
          {name}
          <span className="verified" title="Verified">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l2 2.5 3.2-.7 1.1 3L21 8l-1 3 1.5 2.8-2.3 2.2.3 3.3-3.2.4L14.3 22 12 20.2 9.7 22l-1.9-2.3-3.2-.4.3-3.3L2.5 13.8 4 11 3 8l2.7-1.2 1.1-3L10 4.5z"/>
              <path d="M8.5 12.2l2.4 2.4 4.6-4.6" stroke="#0e0c09" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </h1>
        <div className="profile-handle">{handle}</div>
      </div>
      <SocialRow />
      {bio && <p className="profile-bio">{bio}</p>}
    </>
  );
}

Object.assign(window, { ProfileHeader, SocialRow, SocialIcon });
