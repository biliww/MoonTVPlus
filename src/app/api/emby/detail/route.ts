/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { EmbyClient } from '@/lib/emby.client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('id');

  if (!itemId) {
    return NextResponse.json({ error: '缺少媒体ID' }, { status: 400 });
  }

  try {
    const config = await getConfig();
    const embyConfig = config.EmbyConfig;

    if (!embyConfig?.Enabled || !embyConfig.ServerURL) {
      return NextResponse.json({ error: 'Emby 未配置或未启用' }, { status: 400 });
    }

    const client = new EmbyClient(embyConfig);

    // 如果没有 UserId，需要先认证
    if (!embyConfig.UserId && embyConfig.Username && embyConfig.Password) {
      const authResult = await client.authenticate(embyConfig.Username, embyConfig.Password);
      embyConfig.UserId = authResult.User.Id;
    }

    if (!embyConfig.UserId) {
      return NextResponse.json({ error: 'Emby 认证失败' }, { status: 401 });
    }

    // 获取媒体详情
    const item = await client.getItem(itemId);

    let episodes: any[] = [];

    if (item.Type === 'Series') {
      // 获取所有剧集
      const allEpisodes = await client.getEpisodes(itemId);

      episodes = allEpisodes
        .sort((a, b) => {
          if (a.ParentIndexNumber !== b.ParentIndexNumber) {
            return (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0);
          }
          return (a.IndexNumber || 0) - (b.IndexNumber || 0);
        })
        .map((ep) => ({
          id: ep.Id,
          title: ep.Name,
          episode: ep.IndexNumber || 0,
          season: ep.ParentIndexNumber || 1,
          overview: ep.Overview || '',
          playUrl: client.getStreamUrl(ep.Id),
        }));
    }

    return NextResponse.json({
      success: true,
      item: {
        id: item.Id,
        title: item.Name,
        type: item.Type === 'Movie' ? 'movie' : 'tv',
        overview: item.Overview || '',
        poster: client.getImageUrl(item.Id, 'Primary'),
        year: item.ProductionYear?.toString() || '',
        rating: item.CommunityRating || 0,
        playUrl: item.Type === 'Movie' ? client.getStreamUrl(item.Id) : undefined,
      },
      episodes: item.Type === 'Series' ? episodes : [],
    });
  } catch (error) {
    console.error('获取 Emby 详情失败:', error);
    return NextResponse.json(
      { error: '获取 Emby 详情失败: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
