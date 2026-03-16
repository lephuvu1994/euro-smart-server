export declare class HomeResponseDto {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radius: number;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}
export declare class RoomResponseDto {
  id: string;
  name: string;
  homeId: string;
  floorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export declare class FloorResponseDto {
  id: string;
  name: string;
  sortOrder: number;
  homeId: string;
  rooms: RoomResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}
export declare class HomeMemberResponseDto {
  id: string;
  userId: string;
  homeId: string;
  role: string;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}
