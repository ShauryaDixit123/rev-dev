import { Prisma } from "@prisma/client";
import { filterUserI, filterUserRepoI } from "../interfaces/user.interface";

export class UserFilterObject {
  buildFilterObject(params?: filterUserRepoI): Prisma.UserFindManyArgs {
    const obj: Prisma.UserFindManyArgs = {
      select: {
        ...this.userSelectObject,
      },
    };
    if (params) {
      if (params.pg)
        obj.skip = params.pg && params.pg == 1 ? 0 : params.pg * 10;
      if (params.offset)
        obj.take = params.offset !== undefined ? params.offset : null;
      if (params.search) {
        obj.where.OR = [
          {
            firstName: {
              startsWith: params.search || this.firstUpperCase(params.search),
            },
          },
          {
            lastName: {
              startsWith: params.search || this.firstUpperCase(params.search),
            },
          },
        ];
      }
      if (params.createdBy) {
        obj.where.createdBy = params.createdBy;
      }
      if (params.roleId) obj.where = { ...obj.where, roleId: params.roleId };
    }
    return obj;
  }
  userIncludeObject: Prisma.UserInclude = {
    ProfileImage: true,
    UserImageMap: {
      include: {
        Image: {},
      },
    },
    Role: {},
  };
  userSelectObject: Prisma.UserSelect = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    mobile: true,
    roleId: true,
    accessToken: true,
    ...this.userIncludeObject,
  };
  firstUpperCase(s: string) {
    return s
      .split("")
      .map((v, i) => (i == 0 ? v.toUpperCase() : v))
      .join("");
  }
}
