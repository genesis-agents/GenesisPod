'use client';

import { useRef } from 'react';
import type { GeneratedImage } from '../types';
import { ClientDate } from '@/components/common/ClientDate';

interface ThumbnailGalleryProps {
  images: GeneratedImage[];
  selectedImage: GeneratedImage | null;
  bookmarkedImages: Set<string>;
  onSelect: (img: GeneratedImage) => void;
  onContextMenu: (e: React.MouseEvent, img: GeneratedImage) => void;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  isVertical?: boolean;
}

export function ThumbnailGallery({
  images,
  selectedImage,
  bookmarkedImages,
  onSelect,
  onContextMenu,
  onWheel,
  isVertical = true,
}: ThumbnailGalleryProps) {
  const galleryRef = useRef<HTMLDivElement>(null);

  if (images.length === 0) {
    return (
      <div
        className={`flex items-center justify-center ${isVertical ? 'h-full' : 'h-20'}`}
      >
        <div className="p-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 shadow-inner">
            <svg
              className="h-6 w-6 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-xs font-medium text-gray-400">
            {isVertical ? 'History' : 'Images'}
          </p>
          <p className="mt-1 text-[10px] leading-tight text-gray-300">
            {isVertical ? 'Your creations appear here' : 'No images yet'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={galleryRef}
      onWheel={onWheel}
      className={`
        ${
          isVertical
            ? 'flex flex-col items-center gap-2 overflow-y-auto overflow-x-hidden px-2 py-2'
            : 'flex flex-row gap-2 overflow-x-auto overflow-y-hidden px-2 py-2'
        }
        scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400
      `}
    >
      {images.map((img, index) => (
        <button
          key={img.id}
          onClick={() => onSelect(img)}
          onContextMenu={(e) => onContextMenu(e, img)}
          className={`
            relative flex-shrink-0 overflow-hidden rounded-lg transition-all duration-200
            ${isVertical ? 'h-16 w-16' : 'h-14 w-14'}
            ${
              selectedImage?.id === img.id
                ? 'scale-105 ring-2 ring-purple-500 ring-offset-2 ring-offset-white'
                : 'hover:scale-102 opacity-70 hover:opacity-100'
            }
          `}
        >
          {/* Number indicator */}
          <div className="absolute left-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] font-medium text-white">
            {images.length - index}
          </div>
          {/* Library indicator */}
          {bookmarkedImages.has(img.id) && (
            <div className="absolute right-0.5 top-0.5 z-10">
              <svg
                className="h-3 w-3 text-amber-500 drop-shadow"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
          {/* Time indicator */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5">
            <span className="text-[8px] text-white/90">
              <ClientDate
                date={img.createdAt}
                format="time"
                timeOptions={{
                  hour: '2-digit',
                  minute: '2-digit',
                }}
              />
            </span>
          </div>
          <img
            src={img.imageUrl}
            alt={img.prompt}
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}
