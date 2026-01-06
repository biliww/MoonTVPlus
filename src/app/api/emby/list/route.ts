/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { EmbyClient } from '@/lib/emby.client';
import { getCachedEmbyList, setCachedEmbyList } from '@/lib/emby-cache';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');
  const parentId = searchParams.get('parentId') || undefined;

  try {
    // 检查缓存
    const cached = getCachedEmbyList(page, pageSize, parentId);
    if (cached) {
      return NextResponse.json(cached);
    }

    const config = await getConfig();
    const embyConfig = config.EmbyConfig;

    if (!embyConfig?.Enabled || !embyConfig.ServerURL) {
      return NextResponse.json({
        error: 'Emby 未配置或未启用',
        list: [],
        totalPages: 0,
        currentPage: page,
        total: 0,
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
          list: [],
          totalPages: 0,
          currentPage: page,
          total: 0,
        });
      }
    }

    // 验证认证信息：必须有 ApiKey 或 UserId
    if (!embyConfig.ApiKey && !embyConfig.UserId) {
      return NextResponse.json({
        error: 'Emby 认证失败，请检查配置',
        list: [],
        totalPages: 0,
        currentPage: page,
        total: 0,
      });
    }

    // 获取媒体列表
    const result = await client.getItems({
      ParentId: parentId,
      IncludeItemTypes: 'Movie,Series',
      Recursive: true,
      Fields: 'Overview,ProductionYear',
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      StartIndex: (page - 1) * pageSize,
      Limit: pageSize,
    });

    const list = result.Items.map((item) => ({
      id: item.Id,
      title: item.Name,
      poster: client.getImageUrl(item.Id, 'Primary'),
      year: item.ProductionYear?.toString() || '',
      rating: item.CommunityRating || 0,
      mediaType: item.Type === 'Movie' ? 'movie' : 'tv',
    }));

    const totalPages = Math.ceil(result.TotalRecordCount / pageSize);

    const response = {
      success: true,
      list,
      totalPages,
      currentPage: page,
      total: result.TotalRecordCount,
    };

    // 缓存结果
    setCachedEmbyList(page, pageSize, response, parentId);

    return NextResponse.json(response);
  } catch (error) {
    console.error('获取 Emby 列表失败:', error);
    return NextResponse.json({
      error: '获取 Emby 列表失败: ' + (error as Error).message,
      list: [],
      totalPages: 0,
      currentPage: page,
      total: 0,
    });
  }
}
