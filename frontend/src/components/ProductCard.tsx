import { useEffect, useRef, useState } from 'react';

interface ProductCardProps {
  id: string;
  nome: string;
  preco: number;
  emoji: string;
  cor: string;
  quantidade: number;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

export default function ProductCard({
  id,
  nome,
  preco,
  emoji,
  cor,
  quantidade,
  onAdd,
  onRemove,
}: ProductCardProps) {
  const [pulse, setPulse] = useState(false);
  const timeoutRef = useRef<number>();

  useEffect(() => {
    return () => window.clearTimeout(timeoutRef.current);
  }, []);

  const handleAdd = () => {
    onAdd(id);
    setPulse(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setPulse(false), 200);
  };

  const disabled = quantidade === 0;

  return (
    <div
      className={`card${pulse ? ' pulse' : ''}`}
      style={{
        border: `2px solid ${cor}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 72, lineHeight: 1 }}>{emoji}</div>

      <div style={{ fontSize: 16, fontWeight: 600, textAlign: 'center' }}>
        {nome}
      </div>

      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 36,
          color: cor,
          lineHeight: 1,
        }}
      >
        {formatPreco(preco)}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginTop: 4,
        }}
      >
        <button
          onClick={() => onRemove(id)}
          disabled={disabled}
          aria-label={`Remover ${nome}`}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: `2px solid ${cor}`,
            background: 'transparent',
            color: cor,
            fontSize: 24,
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.3 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.15s ease',
          }}
        >
          −
        </button>

        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 28,
            minWidth: 28,
            textAlign: 'center',
          }}
        >
          {quantidade}
        </span>

        <button
          onClick={handleAdd}
          aria-label={`Adicionar ${nome}`}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: `2px solid ${cor}`,
            background: cor,
            color: '#ffffff',
            fontSize: 24,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
