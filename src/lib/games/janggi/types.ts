export type Color = 'w' | 'b';
export type PieceType = 'king' | 'guard' | 'rook' | 'cannon' | 'horse' | 'elephant' | 'soldier';
export type Piece = { type: PieceType; color: Color };
export type BoardMap = Record<string, Piece>;

export interface Move {
  from: string;
  to: string;
  capture?: boolean;
}
