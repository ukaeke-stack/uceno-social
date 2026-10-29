import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RELEASE_URL = 'https://api.github.com/repos/ukaeke-stack/uceno-social/releases/latest';

type GitHubAsset = { name?: string; browser_download_url?: string; size?: number };
type GitHubRelease = {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubAsset[];
};

export async function GET() {
  try {
    const response = await fetch(RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    });
    if (response.status === 404) {
      return NextResponse.json({ available: false, message: 'No Android release has been published yet.' }, { status: 200 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: 'Could not check for Android updates right now.' }, { status: 502 });
    }

    const release = (await response.json()) as GitHubRelease;
    const asset = (release.assets || []).find((item) =>
      /^uceno-android-v.+-code-\d+\.apk$/i.test(item.name || '') &&
      typeof item.browser_download_url === 'string' &&
      item.browser_download_url.startsWith('https://github.com/ukaeke-stack/uceno-social/releases/download/')
    );
    if (!asset?.name || !asset.browser_download_url) {
      return NextResponse.json({ available: false, message: 'The latest release does not contain a downloadable Android APK yet.' }, { status: 200 });
    }

    const codeMatch = asset.name.match(/-code-(\d+)\.apk$/i);
    const versionCode = codeMatch ? Number(codeMatch[1]) : NaN;
    if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
      return NextResponse.json({ error: 'The published Android release has invalid version information.' }, { status: 502 });
    }

    return NextResponse.json({
      available: true,
      versionName: (release.tag_name || release.name || '').replace(/^v/i, ''),
      versionCode,
      downloadUrl: asset.browser_download_url,
      releaseUrl: release.html_url || 'https://github.com/ukaeke-stack/uceno-social/releases',
      releaseNotes: release.body || '',
      publishedAt: release.published_at || null,
      fileSize: typeof asset.size === 'number' ? asset.size : null,
      packageId: 'com.ukaeke.uceno',
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'Could not check for Android updates right now.' }, { status: 502 });
  }
}
