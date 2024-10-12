import {
  ForbiddenException,
  Injectable,
  Logger,
  NestMiddleware,
} from "@nestjs/common";
import { AuthService } from "src/modules/user/services/auth.service";
import { CommonExceptions } from "../constants/status";
import { AccessControlRepository } from "src/modules/user/repositories/acessControl.repository";
import { UsersRepository } from "src/modules/user/repositories/user.repository";

@Injectable()
export class AccessMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: Logger,
    private readonly authService: AuthService,
    private readonly accessControlRepo: AccessControlRepository,
    private readonly usersRepo: UsersRepository
  ) {}
  async use(req: Request, res: Response, next: () => void) {
    this.logger.log("in mid!");
    req.headers["authorize_success"] = false;
    // flag to put if authorized finally or not and check in interceptor
    try {
      const accessToken: string = req.headers["authorization"] as string;
      if (!accessToken) {
        throw CommonExceptions.INVALID_ACCESS_TOKEN;
      }
      const decodedTkn = await this.authService.verifyToken({
        token: accessToken,
      });
      if (!decodedTkn.valid) {
        throw CommonExceptions.TOKEN_EXPIRED;
      } // FE WILL GET 303 ERROR IF TOKEN IS NOT VALID AND LATER HAS TO REQUEST WITH THIS EXPIRED TOKEN TO GET NEW ONE
      const userDetails = await this.usersRepo.getUserById({
        id: decodedTkn["userId"],
      });
      if (userDetails.accessToken !== accessToken)
        throw CommonExceptions.TOKEN_EXPIRED;
      const resc: string = req.headers["resource"];
      const act = parseInt(req.headers["action"]);
      const atb: {
        name: string;
        value: string;
      } = req.headers["atb"] ? JSON.parse(req.headers["atb"]) : undefined;
      if (!userDetails) {
        throw CommonExceptions.INVALID_ACCESS_TOKEN;
      }
      if (act == undefined || !resc) {
        throw CommonExceptions.INVAID_GENERAL;
      }
      req["context"] = { userDetails };
      console.log(userDetails, "User Details");
      const rescInfo = await this.accessControlRepo.getResourceInfo({
        resc,
        roleId: userDetails.roleId,
        action: act,
        attribute: atb,
      });
      this.logger.log(rescInfo, "Resources of user!");
      if (
        !atb &&
        (rescInfo.ResourceAction.length === 0 ||
          (rescInfo.ResourceAction?.[0]?.ResourceActionPermission.length ===
            0 &&
            rescInfo.ResourceAction[0]?.ResourceActionDepend.length === 0))
      ) {
        throw CommonExceptions.ACCESS_NOT_ALLOWED;
      }
      if (
        atb &&
        rescInfo.ResourceAttribute?.[0]?.ResourceAttributeAction?.[0]
          ?.ResourceAttributeActionPermission.length === 0 &&
        rescInfo.ResourceAttribute?.[0]?.ResourceAttributeAction?.[0]
          ?.ResourceAttributeActionDepend.length === 0
      ) {
        throw CommonExceptions.ACCESS_NOT_ALLOWED;
      }
      if (rescInfo.ResourceAction.length > 0) {
        if (rescInfo.ResourceAction[0]?.ResourceActionDepend.length > 0) {
          await this.authService.resolveDependsPermissions({
            action: act,
            depends: rescInfo.ResourceAction?.[0].ResourceActionDepend,
            permissions:
              rescInfo.ResourceAction?.[0].ResourceActionPermission[0],
          });
        }
        if (
          rescInfo.ResourceAction?.[0]?.ResourceActionPermission.length > 0 &&
          rescInfo.ResourceAction[0]?.ResourceActionDepend.length === 0
        ) {
          await this.authService.flagForResources({
            permission: rescInfo.ResourceAction[0].ResourceActionPermission[0],
            resource: rescInfo.name,
          });
        }
        if (
          atb &&
          rescInfo.ResourceAttribute?.[0].ResourceAttributeAction?.[0]
            .ResourceAttributeActionPermission.length > 0 &&
          rescInfo.ResourceAttribute?.[0].ResourceAttributeAction?.[0]
            ?.ResourceAttributeActionDepend.length === 0
        ) {
          await this.authService.flagForResources({
            permission: {
              ...rescInfo.ResourceAttribute?.[0].ResourceAttributeAction?.[0]
                .ResourceAttributeActionPermission,
              roleId: userDetails.roleId,
            },
          });
        }
      }
      this.logger.debug("hehrherhehrhe5", req.headers);
      req["context"] = {
        ...req["context"],
        resc,
        atb,
        act,
      };
    } catch (e) {
      this.logger.error("Middleware ERROR:", e);
      throw e;
    }
    next();
  }
}
