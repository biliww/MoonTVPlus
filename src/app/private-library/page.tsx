/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

type LibrarySource = 'openlist' | 'emby';

interface Video {
  id: string;
  folder?: string;
  tmdbId?: number;
  title: string;
  poster: string;
  releaseDate?: string;
  year?: string;
  overview?: string;
  voteAverage?: number;
  rating?: number;
  mediaType: 'movie' | 'tv';
}

interface EmbyView {
  id: string;
  name: string;
  type: string;
}

export default function PrivateLibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [source, setSource] = useState<LibrarySource>('openlist');
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [embyViews, setEmbyViews] = useState<EmbyView[]>([]);
  const [selectedView, setSelectedView] = useState<string>('all');
  const [loadingViews, setLoadingViews] = useState(false);
  const pageSize = 20;
  const observerTarget = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const isInitializedRef = useRef(false);

  // 从URL初始化状态
  useEffect(() => {
    const urlSource = searchParams.get('source') as LibrarySource;
    const urlView = searchParams.get('view');

    if (urlSource && (urlSource === 'openlist' || urlSource === 'emby')) {
      setSource(urlSource);
    }

    if (urlView) {
      setSelectedView(urlView);
    }

    isInitializedRef.current = true;
  }, [searchParams]);

  // 更新URL参数
  useEffect(() => {
    if (!isInitializedRef.current) return;

    const params = new URLSearchParams();
    params.set('source', source);
    if (source === 'emby' && selectedView !== 'all') {
      params.set('view', selectedView);
    }
    router.replace(`/private-library?${params.toString()}`, { scroll: false });
  }, [source, selectedView, router]);

  // 切换源时重置所有状态（但不在初始化时执行）
  useEffect(() => {
    if (!isInitializedRef.current) return;

    setPage(1);
    setVideos([]);
    setHasMore(true);
    setError('');
    setSelectedView('all');
    isFetchingRef.current = false;
  }, [source]);

  // 切换分类时重置状态（但不在初始化时执行）
  useEffect(() => {
    if (!isInitializedRef.current) return;

    setPage(1);
    setVideos([]);
    setHasMore(true);
    setError('');
    isFetchingRef.current = false;
  }, [selectedView]);

  // 获取 Emby 媒体库列表
  useEffect(() => {
    if (source !== 'emby') return;

    const fetchEmbyViews = async () => {
      setLoadingViews(true);
      try {
        const response = await fetch('/api/emby/views');
        const data = await response.json();

        if (data.error) {
          console.error('获取 Emby 媒体库列表失败:', data.error);
          setEmbyViews([]);
        } else {
          setEmbyViews(data.views || []);

          // 分类加载完成后，检查URL中是否有view参数
          const urlView = searchParams.get('view');
          if (urlView && data.views && data.views.length > 0) {
            // 检查该view是否存在于分类列表中
            const viewExists = data.views.some((v: EmbyView) => v.id === urlView);
            if (viewExists) {
              setSelectedView(urlView);
            }
          }
        }
      } catch (err) {
        console.error('获取 Emby 媒体库列表失败:', err);
        setEmbyViews([]);
      } finally {
        setLoadingViews(false);
      }
    };

    fetchEmbyViews();
  }, [source]);

  // 鼠标拖动滚动
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
    scrollContainerRef.current.style.cursor = 'grabbing';
    scrollContainerRef.current.style.userSelect = 'none';
  };

  const handleMouseLeave = () => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = 'auto';
  };

  const handleMouseUp = () => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = 'auto';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 2; // 滚动速度倍数
    scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  // 加载数据的函数
  useEffect(() => {
    const fetchVideos = async () => {
      const isInitial = page === 1;

      // 防止重复请求
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;

      try {
        if (isInitial) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError('');

        const endpoint = source === 'openlist'
          ? `/api/openlist/list?page=${page}&pageSize=${pageSize}`
          : `/api/emby/list?page=${page}&pageSize=${pageSize}${selectedView !== 'all' ? `&parentId=${selectedView}` : ''}`;

        const response = await fetch(endpoint);

        if (!response.ok) {
          throw new Error('获取视频列表失败');
        }

        const data = await response.json();

        if (data.error) {
          setError(data.error);
          if (isInitial) {
            setVideos([]);
          }
        } else {
          const newVideos = data.list || [];

          if (isInitial) {
            setVideos(newVideos);
          } else {
            setVideos((prev) => [...prev, ...newVideos]);
          }

          // 检查是否还有更多数据
          const currentPage = data.page || page;
          const totalPages = data.totalPages || 1;
          const hasMoreData = currentPage < totalPages;
          setHasMore(hasMoreData);
        }
      } catch (err) {
        console.error('获取视频列表失败:', err);
        setError('获取视频列表失败');
        if (isInitial) {
          setVideos([]);
        }
      } finally {
        if (isInitial) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
        isFetchingRef.current = false;
      }
    };

    fetchVideos();
  }, [source, page, selectedView]);

  const handleVideoClick = (video: Video) => {
    // 跳转到播放页面
    router.push(`/play?source=${source}&id=${encodeURIComponent(video.id)}`);
  };

  // 使用 Intersection Observer 监听滚动
  useEffect(() => {
    if (!observerTarget.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        // 当目标元素可见且还有更多数据且没有正在加载时，加载下一页
        if (entry.isIntersecting && hasMore && !loadingMore && !loading && !isFetchingRef.current) {
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentTarget = observerTarget.current;
    observer.observe(currentTarget);

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loading, page]);

  return (
    <PageLayout activePath='/private-library'>
      <div className='container mx-auto px-4 py-6'>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
            私人影库
          </h1>
          <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
            观看自我收藏的高清视频吧
          </p>
        </div>

        {/* 源切换器 */}
        <div className='mb-6 flex justify-center'>
          <CapsuleSwitch
            options={[
              { label: 'OpenList', value: 'openlist' },
              { label: 'Emby', value: 'emby' }
            ]}
            active={source}
            onChange={(value) => setSource(value as LibrarySource)}
          />
        </div>

        {/* Emby 分类选择器 */}
        {source === 'emby' && (
          <div className='mb-6'>
            {loadingViews ? (
              <div className='flex justify-center'>
                <div className='w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
              </div>
            ) : embyViews.length > 0 ? (
              <div className='relative'>
                <div
                  ref={scrollContainerRef}
                  className='overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing'
                  onMouseDown={handleMouseDown}
                  onMouseLeave={handleMouseLeave}
                  onMouseUp={handleMouseUp}
                  onMouseMove={handleMouseMove}
                >
                  <div className='flex gap-2 px-4 min-w-min'>
                    <button
                      onClick={() => setSelectedView('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        selectedView === 'all'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      全部
                    </button>
                    {embyViews.map((view) => (
                      <button
                        key={view.id}
                        onClick={() => setSelectedView(view.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                          selectedView === view.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {view.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {error && (
          <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6'>
            <p className='text-red-800 dark:text-red-200'>{error}</p>
          </div>
        )}

        {loading ? (
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
            {Array.from({ length: pageSize }).map((_, index) => (
              <div
                key={index}
                className='animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg aspect-[2/3]'
              />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className='text-center py-12'>
            <p className='text-gray-500 dark:text-gray-400'>
              {source === 'openlist'
                ? '暂无视频，请在管理面板配置 OpenList 并刷新'
                : '暂无视频，请在管理面板配置 Emby'}
            </p>
          </div>
        ) : (
          <>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  id={video.id}
                  source={source}
                  title={video.title}
                  poster={video.poster}
                  year={video.year || (video.releaseDate ? video.releaseDate.split('-')[0] : '')}
                  rate={
                    video.rating
                      ? video.rating.toFixed(1)
                      : video.voteAverage && video.voteAverage > 0
                      ? video.voteAverage.toFixed(1)
                      : ''
                  }
                  from='search'
                />
              ))}
            </div>

            {/* 滚动加载指示器 - 始终渲染以便 observer 可以监听 */}
            <div ref={observerTarget} className='flex justify-center items-center py-8 min-h-[100px]'>
              {loadingMore && (
                <div className='flex items-center gap-2 text-gray-600 dark:text-gray-400'>
                  <div className='w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
                  <span>加载中...</span>
                </div>
              )}
              {!hasMore && videos.length > 0 && !loadingMore && (
                <div className='text-gray-500 dark:text-gray-400'>
                  已加载全部内容
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
