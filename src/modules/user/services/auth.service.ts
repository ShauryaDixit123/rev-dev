import { Inject, Injectable, Logger } from "@nestjs/common";
import { DbClient } from "src/common/services/dbclient.service";
import { UserFilterObject } from "../constants/filterObjects";
import { AccessControlRepository } from "../repositories/acessControl.repository";
import { CommonExceptions } from "src/common/constants/status";
import { Prisma } from "@prisma/client";
import {
  RESOURCE__DATA_TYPE,
  RESOURCE_ATTRIB_DATA_TYPE,
} from "../constants/roles";
import * as jwt from "jsonwebtoken";
import { ConfigService } from "@nestjs/config";
import { UsersRepository } from "../repositories/user.repository";
@Injectable()
export class AuthService {
  constructor(
    private readonly dbClient: DbClient,
    private readonly accessControlRepo: AccessControlRepository,
    private readonly userFilterObj: UserFilterObject,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly usersRepo: UsersRepository,
    @Inject("REQUEST")
    private readonly req: Request
  ) {}

  async checkForDependentResource(params: {
    name: string;
    action: number;
    roleId: number;
  }) {
    // const { reqContext } = params;
    const resD = await this.accessControlRepo.getResourceDetails({
      name: params.name,
      action: params.action,
      roleId: params.roleId,
    });
    this.req.headers["_dependencyResource"] = params.name;
    if (resD.ResourceAction[0].ResourceActionPermission[0].isCreated) {
      this.req.headers["_dependencyResource_Part"] = "isCreated";
    }
    if (resD.ResourceAction[0].ResourceActionPermission[0].isIncluded) {
      this.req.headers["_dependencyResource_Part"] = "isIncluded";
    }
    // this.logger.log("request context", this.req.headers);
  }
  async checkForDependentResourceAttribute(params: {
    resourceId: number;
    atb: {
      name: string;
      value: string;
    };
    action: number;
    roleId: number;
  }) {
    const resAttrib = await this.accessControlRepo.getResourceAttributesInfo({
      rescId: params.resourceId,
      atb: params.atb,
      action: params.action,
      roleId: params.roleId,
    });
    // this.logger.log(resAttrib, "dependent resource attribute");
    if (resAttrib.ResourceAttributeAction.length > 0) {
      const attrb = resAttrib.ResourceAttributeAction?.[0];
      if (attrb.ResourceAttributeActionPermission.length === 0)
        throw CommonExceptions.ACCESS_NOT_ALLOWED;
    }
    this.req.headers["authorize_success"] = true;
  }
  async flagForResources(params: {
    permission: Prisma.ResourceActionPermissionCreateManyResourceActionInput;
    resource?: string;
  }) {
    this.logger.debug(params, "kdkdkddkk");
    if (params.resource) {
      this.req.headers["_dependencyResource"] = params.resource;
      if (params.permission?.isCreated)
        this.req.headers["_dependencyResource_Part"] = "isCreated";
      if (params.permission?.isIncluded)
        this.req.headers["_dependencyResource_Part"] = "isIncluded";
    } else {
      const perms = params.permission;
      // params.rescInfo.ResourceAttribute?.[0].ResourceAttributeAction?.[0]
      //   .ResourceAttributeActionPermission[0];
      if (perms.isCreated) {
        this.req.headers["_dependencyResource_Part"] = "isCreated";
      }
      if (perms.isIncluded) {
        this.req.headers["_dependencyResource_Part"] = "isIncluded";
      }
    }
  }
  async resolveOrFlagDependentResources(params: {
    action: number;
    depends: Prisma.ResourceActionDependMaxAggregateOutputType[];
    permissions: Prisma.ResourceActionPermissionCreateManyResourceActionInput;
  }) {
    // if (!depends && !params.atb)
    //   this.flagForResources({
    //     rescInfo,
    //     resource: params.atb ? false : true,
    //   });

    // if (
    //   params.atb &&
    //   rescInfo?.["ResourceAttribute"]?.[0].ResourceAttributeAction?.[0]
    //     .ResourceAttributeActionPermission.length > 0
    // ) {
    //   await this.checkForDependentResourceAttribute({
    //     resourceId: rescInfo.id,
    //     atb: params.atb,
    //     action: params.action,
    //     roleId: userDetails.roleId,
    //   });
    // }
    await this.resolveDependsPermissions({
      action: params.action,
      depends: params.depends,
      permissions: params.permissions,
    });
    // for (const dp of depends || []) {
    //   await this.resolveOrFlagDependentResources({
    //     resource: dp.value,
    //     action: params.action,
    //     ...(dp.type === RESOURCE_ATTRIB_DATA_TYPE && {
    //       atb: {
    //         name: dp.value,
    //         value: accessPayload?.[dp.value],
    //       },
    //     }),
    //   });
    // }
  }

  async resolveDependsPermissions(params: {
    resourceId?: number;
    resc?: string;
    atb?: string;
    action: number;
    permissions?: Prisma.ResourceActionPermissionCreateManyResourceActionInput;
    depends: Prisma.ResourceActionDependMaxAggregateOutputType[];
  }) {
    const { userDetails } = this.req["context"];
    const accessPayload = this.req.headers["accesspayload"]
      ? JSON.parse(this.req.headers["accesspayload"])
      : undefined;
    if (params.resc) {
      console.log("herhehrhe", params.resc, params.permissions);
      this.flagForResources({
        permission: params.permissions,
        resource: params.resc,
      });
    }
    if (params.depends)
      for (const dp of params.depends) {
        if (dp.type === RESOURCE__DATA_TYPE) {
          const resD = await this.accessControlRepo.getResourceDetails({
            name: dp.value,
            action: params.action,
            roleId: userDetails.roleId,
          });
          this.logger.debug("herexczxcz", dp.value, params.permissions, resD);
          this.resolveDependsPermissions({
            resc: resD.name,
            action: params.action,
            depends: resD.ResourceAction?.[0]?.ResourceActionDepend,
            permissions: params.permissions,
          });
        }
        if (dp.type === RESOURCE_ATTRIB_DATA_TYPE) {
          await this.checkForDependentResourceAttribute({
            resourceId: params.resourceId,
            atb: {
              name: dp.value,
              value: accessPayload?.[dp.value],
            },
            action: params.action,
            roleId: userDetails.roleId,
          });
        }
      }
  }

  async generateToken(params: any) {
    return jwt.sign(params, this.configService.get("JWT_SECRET"), {
      expiresIn: this.configService.get("JWT_TTL"),
    });
  }
  async verifyToken(params: { token: string }) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const decoded = jwt.verify(
        params.token,
        this.configService.get("JWT_SECRET")
      ) as jwt.JwtPayload;
      if (!decoded) {
        return { ...decoded, valid: false };
      }
      if (decoded.exp <= now) {
        return { ...decoded, valid: false };
      }
      return { ...decoded, valid: true };
    } catch (e) {
      const decoded = jwt.decode(params.token) as jwt.JwtPayload;
      return { ...decoded, valid: false };
    }
  }

  async createTokenForUser(params: { userId: string }) {
    const tkn = await this.generateToken({ userId: params.userId });
    const ud = await this.usersRepo.getUserById({ id: params.userId });
    const resp = await this.usersRepo.updateUser({
      accessToken: tkn,
      email: ud.email,
    });
    return tkn;
  }
}

//   async resolveOrFlagDependentResources(params: {
//     resource: string;
//     action: number;
//     atb?: {
//       name: string;
//       value: string;
//     };
//   }) {
//     const { userDetails } = this.req["context"];
//     const accessPayload =
//       JSON.parse(this.req.headers["accesspayload"]) || undefined;
//     this.logger.debug("hehrherhehrhe3334", params);
//     const rescInfo: any = await this.accessControlRepo.getResourceDetails({
//       name: params.resource,
//       action: params.action,
//       roleId: userDetails.roleId,
//     });
//     const depends = rescInfo?.["ResourceAction"]?.[0]?.ResourceActionDepend;
//     this.logger.debug("hehrherhehrhe3334555", depends, rescInfo);
//     if (!depends && !params.atb)
//       this.flagForResources({
//         rescInfo,
//         resource: params.atb ? false : true,
//       });

//     if (
//       params.atb &&
//       rescInfo?.["ResourceAttribute"]?.[0].ResourceAttributeAction?.[0]
//         .ResourceAttributeActionPermission.length > 0
//     ) {
//       await this.checkForDependentResourceAttribute({
//         resourceId: rescInfo.id,
//         atb: params.atb,
//         action: params.action,
//         roleId: userDetails.roleId,
//       });
//     }
//     for (const dp of depends || []) {
//       await this.resolveOrFlagDependentResources({
//         resource: dp.value,
//         action: params.action,
//         ...(dp.type === RESOURCE_ATTRIB_DATA_TYPE && {
//           atb: {
//             name: dp.value,
//             value: accessPayload?.[dp.value],
//           },
//         }),
//       });
//     }
//   }
// }
