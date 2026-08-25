import Image from "next/image";

export function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  if (images.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-muted text-muted-foreground">
        No photos yet
      </div>
    );
  }

  const [primary, ...rest] = images;
  const supporting = rest.slice(0, 4);
  const remaining = rest.length - supporting.length;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2 sm:[&>*:first-child]:row-span-2">
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted sm:aspect-auto">
        <Image src={primary} alt={alt} fill priority className="object-cover" unoptimized />
      </div>
      {supporting.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          {supporting.map((image, index) => {
            const isLast = index === supporting.length - 1;
            return (
              <div key={image} className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted">
                <Image
                  src={image}
                  alt={`${alt} — photo ${index + 2}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
                {isLast && remaining > 0 && (
                  <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
                    +{remaining} photos
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
