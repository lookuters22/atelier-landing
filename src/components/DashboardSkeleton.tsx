function LoadingPlaceholder() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/[0.08] border-t-[#0169cc]" />
    </div>
  );
}

export function PageHeaderSkeleton() {
  return <LoadingPlaceholder />;
}

export function TodayPageSkeleton() {
  return <LoadingPlaceholder />;
}

export function ListPageSkeleton() {
  return <LoadingPlaceholder />;
}

export function WeddingDetailSkeleton() {
  return <LoadingPlaceholder />;
}
