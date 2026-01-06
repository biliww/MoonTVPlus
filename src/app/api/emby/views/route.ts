/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { EmbyClient } from '@/lib/emby.client';
import { getCachedEmbyViews, setCachedEmbyViews } from '@/lib/emby-cache';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // 检查缓存
    const cached = getCachedEmbyViews();
    if (cached) {
      return NextResponse.json(cached);
    }

    const config = await getConfig();
    const embyConfig = config.EmbyConfig;

    if (!embyConfig?.Enabled || !embyConfig.ServerURL) {
      return NextResponse.json({
        error: 'Emby 未配置或未启用',
        views: [],
      });
    }

    // 创建 Emby 客户端
    const client = new EmbyClient(embyConfig);

    // 如果使用用户名密码且没有 UserId，需要先认证
    if (!embyConfig.ApiKey && !embyConfig.UserId && embyConfig.Username && embyConfig.Password) {
      try {
        const authResult = await client.authenticate(embyConfig.Username, embyConfig.Password);
        embyConfig.UserId = authResult.User.Id;
      } catch (error) {
        return NextResponse.json({
          error: 'Emby 认证失败: ' + (error as Error).message,
          views: [],
        });
      }
    }

    // 验证认证信息：必须有 ApiKey 或 UserId
    if (!embyConfig.ApiKey && !embyConfig.UserId) {
      return NextResponse.json({
        error: 'Emby 认证失败，请检查配置',
        views: [],
      });
    }

    // 获取媒体库列表
    const views = await client.getUserViews();

    // 过滤出电影和电视剧媒体库
    const filteredViews = views.filter(
      (view) => view.CollectionType === 'movies' || view.CollectionType === 'tvshows'
    );

    const response = {
      success: true,
      views: filteredViews.map((view) => ({
        id: view.Id,
        name: view.Name,
        type: view.CollectionType,
      })),
    };

    // 缓存结果
    setCachedEmbyViews(response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('获取 Emby 媒体库列表失败:', error);
    return NextResponse.json({
      error: '获取 Emby 媒体库列表失败: ' + (error as Error).message,
      views: [],
    });
  }
}
