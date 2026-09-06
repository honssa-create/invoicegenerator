'use client';

import { useRef, useState, type DragEvent } from 'react';
import { compressImage } from '@/lib/imageCompression';
import {
  isAttachmentImage,
  parseThumbnailFileId,
  type AttachmentFile,
} from '@/lib/attachment-files';
import { bi } from '@/lib/ui-labels';

type Props = {
  files: AttachmentFile[];
  fileUrl: (file: AttachmentFile) => string;
  uploadUrl: string;
  fileApiBase: string;
  thumbnailFileId?: unknown;
  onFilesChange: (files: AttachmentFile[]) => void;
  onSetThumbnail: (fileId: number | null) => void;
  readOnly?: boolean;
  title: string;
  subtitle?: string;
  className?: string;
};

export function ListThumb({ src, alt = '' }: { src: string | null; alt?: string }) {
  if (!src) {
    return (
      <span className="inline-flex h-10 w-10 rounded-md border border-gray-200 bg-gray-50 text-[10px] text-gray-400 items-center justify-center shrink-0">
        —
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-10 w-10 rounded-md object-cover border border-gray-200 bg-white shrink-0"
    />
  );
}

export default function EntityAttachments({
  files,
  fileUrl,
  uploadUrl,
  fileApiBase,
  thumbnailFileId,
  onFilesChange,
  onSetThumbnail,
  readOnly = false,
  title,
  subtitle,
  className = '',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameCancelledRef = useRef(false);

  const prepareUploads = async (list: File[]): Promise<File[]> => {
    const prepared: File[] = [];
    for (const f of list) {
      try {
        if (f.type === 'application/pdf') {
          setUploadMsg(`Compressing PDF “${f.name}” pages…`);
          const { compressPdfToImages } = await import('@/lib/pdfCompression');
          const pages = await compressPdfToImages(f);
          prepared.push(...pages);
        } else if (f.type.startsWith('image/')) {
          const c = await compressImage(f, { maxDim: 1600, targetBytes: 300 * 1024, mimeType: 'image/jpeg' });
          prepared.push(c.file);
        } else {
          prepared.push(f);
        }
      } catch {
        prepared.push(f);
      }
    }
    return prepared;
  };

  const uploadFiles = async (incoming: FileList | File[]) => {
    if (readOnly) return;
    const list = Array.from(incoming);
    if (!list.length) return;
    setUploadMsg(bi('Optimising files…', '正在最佳化檔案…'));
    const prepared = await prepareUploads(list);
    if (!prepared.length) {
      setUploadMsg('');
      return;
    }
    setUploadMsg(bi(`Uploading ${prepared.length} file(s)…`, `正在上傳 ${prepared.length} 個檔案…`));
    const fd = new FormData();
    prepared.forEach((f) => fd.append('file', f));
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onFilesChange(data.files || []);
        setUploadMsg('');
      } else {
        setUploadMsg(data.error || bi('Upload failed', '上傳失敗'));
      }
    } catch {
      setUploadMsg(bi('Upload failed', '上傳失敗'));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    const dropped = e.dataTransfer.files;
    if (dropped?.length) void uploadFiles(dropped);
  };

  const deleteFile = async (fileId: number) => {
    if (readOnly) return;
    const res = await fetch(`${fileApiBase}/${fileId}`, { method: 'DELETE' });
    if (!res.ok) return;
    onFilesChange(files.filter((f) => f.id !== fileId));
    if (parseThumbnailFileId(thumbnailFileId) === fileId) onSetThumbnail(null);
  };

  const downloadFile = async (f: AttachmentFile) => {
    try {
      const res = await fetch(`${fileUrl(f)}?download=1`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.original_name || `file-${f.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const startRename = (f: AttachmentFile) => {
    if (readOnly) return;
    renameCancelledRef.current = false;
    setRenamingFileId(f.id);
    setRenameDraft(f.original_name || `Image #${f.id}`);
  };

  const cancelRename = () => {
    renameCancelledRef.current = true;
    setRenamingFileId(null);
    setRenameDraft('');
  };

  const saveRename = async (fileId: number) => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      setRenamingFileId(null);
      setRenameDraft('');
      return;
    }
    const name = renameDraft.trim();
    if (!name) {
      setRenamingFileId(null);
      setRenameDraft('');
      return;
    }
    const current = files.find((f) => f.id === fileId);
    if (current && (current.original_name || '').trim() === name) {
      setRenamingFileId(null);
      setRenameDraft('');
      return;
    }
    const res = await fetch(`${fileApiBase}/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_name: name }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.file) {
        onFilesChange(files.map((f) => (f.id === fileId ? { ...f, original_name: data.file.original_name } : f)));
      }
    }
    setRenamingFileId(null);
    setRenameDraft('');
  };

  const imageFiles = files.filter(isAttachmentImage);
  const imageCount = imageFiles.length;
  const thumbId = parseThumbnailFileId(thumbnailFileId);
  const effectiveThumbId =
    thumbId && imageFiles.some((f) => f.id === thumbId) ? thumbId : imageFiles[0]?.id;

  const dropHandlers = readOnly
    ? {}
    : {
        onDrop,
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
        },
        onDragEnter: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
        },
      };

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm sm:text-base">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          {uploadMsg && <p className="text-xs text-brand-700 mt-0.5">{uploadMsg}</p>}
        </div>
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium shrink-0"
            >
              + {bi('Upload files', '上傳檔案')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>

      {files.length === 0 ? (
        <div
          onClick={() => !readOnly && fileInputRef.current?.click()}
          {...dropHandlers}
          className={`border-2 border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm ${
            readOnly ? '' : 'cursor-pointer hover:border-brand-400 hover:bg-brand-50/40'
          }`}
        >
          {readOnly
            ? bi('No attachments yet', '尚無附件')
            : bi('Drop any file here, or click to upload', '拖放任意檔案到此處，或點擊上傳')}
          {!readOnly && (
            <span className="block text-[11px] mt-1 text-gray-400">
              {bi('Images are compressed; heavy PDFs become page images', '圖片會壓縮；大型 PDF 會轉成頁面圖片')}
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!readOnly && (
            <div
              onClick={() => fileInputRef.current?.click()}
              {...dropHandlers}
              className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-center text-xs text-gray-400 cursor-pointer hover:border-brand-400 hover:bg-brand-50/40"
            >
              {bi('Drop more files here, or click to upload', '拖放更多檔案到此處，或點擊上傳')}
            </div>
          )}
          <ul className="space-y-2">
            {files.map((f) => {
              const url = fileUrl(f);
              const name = f.original_name || `File #${f.id}`;
              const renaming = renamingFileId === f.id;
              const isImage = isAttachmentImage(f);
              const isThumb = isImage && f.id === effectiveThumbId;
              return (
                <li
                  key={f.id}
                  className={`flex items-center gap-3 rounded-lg border bg-gray-50/80 px-3 py-2 ${
                    isThumb ? 'border-brand-300 ring-1 ring-brand-200' : 'border-gray-200'
                  }`}
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={name}
                      onClick={() => setLightbox(url)}
                      className="h-14 w-14 rounded-md object-cover border border-gray-200 shrink-0 bg-white cursor-zoom-in hover:ring-2 hover:ring-brand-400"
                    />
                  ) : (
                    <span className="h-14 w-14 rounded-md bg-white border border-gray-200 flex items-center justify-center text-gray-400 text-xs font-medium shrink-0">
                      FILE
                    </span>
                  )}
                  {renaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => saveRename(f.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      className="flex-1 min-w-0 rounded-md border border-brand-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      aria-label={bi('Rename file', '重新命名檔案')}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => (isImage ? setLightbox(url) : void downloadFile(f))}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        startRename(f);
                      }}
                      className="flex-1 min-w-0 text-left text-sm text-brand-700 hover:underline truncate"
                      title={readOnly ? undefined : bi('Double-click to rename', '雙擊重新命名')}
                    >
                      {name}
                    </button>
                  )}
                  {!renaming && !readOnly && isImage && imageCount > 1 && (
                    isThumb ? (
                      <span className="text-[11px] font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-md px-2 py-1 shrink-0">
                        {bi('Thumbnail', '封面')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSetThumbnail(f.id)}
                        className="text-xs text-gray-600 hover:text-brand-700 font-medium shrink-0 px-2 py-1"
                        title={bi('Use this image on the list / board card', '在列表或看板卡片上使用此圖片')}
                      >
                        {bi('Set thumbnail', '設為封面')}
                      </button>
                    )
                  )}
                  {!renaming && !readOnly && (
                    <button
                      type="button"
                      onClick={() => startRename(f)}
                      className="text-xs text-gray-600 hover:text-gray-800 font-medium shrink-0 px-2 py-1"
                    >
                      {bi('Rename', '重新命名')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadFile(f)}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0 px-2 py-1"
                  >
                    {bi('Download', '下載')}
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => deleteFile(f.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium shrink-0 px-2 py-1"
                      aria-label="Delete file"
                    >
                      {bi('Delete', '刪除')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white"
          />
        </div>
      )}
    </div>
  );
}
