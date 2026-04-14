export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-muted-foreground opacity-50">{title}</h1>
        <p className="text-muted-foreground opacity-40">Module under construction</p>
      </div>
    </div>
  );
}
