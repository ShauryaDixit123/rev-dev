import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { createUserI, filterUserI } from "../interfaces/user.interface";
import { UsersRepository } from "../repositories/user.repository";
import { PayloadValidationPipe } from "src/common/pipes/payload.pipe";
import { createUserReqSchema } from "../validationSchema/user";
import { generateRandomPassword } from "src/common/helpers/generatePassword";
import { BooksRepository } from "src/modules/book/repositories/book.repository";
import {
  CommonExceptions,
  DbExecptions,
  MessageError,
} from "src/common/constants/status";
import { AccessControlRepository } from "../repositories/acessControl.repository";
import { UserService } from "../services/user.service";
import { DataResponse } from "src/common/constants/http/response";
import { UserResourceIncludeGuard } from "../gaurds/userInc.guard";
import { AuthService } from "../services/auth.service";
const bcrypt = require("bcryptjs");
@Controller("users")
export class UserController {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly booksRepo: BooksRepository,
    private readonly accessControlRepo: AccessControlRepository,
    private readonly usersService: UserService,
    private readonly authService: AuthService
  ) {}

  @Post()
  @UsePipes(new PayloadValidationPipe(createUserReqSchema))
  async add(@Body() body: createUserI, @Req() req: Request) {
    let userD;
    const { role, ...rest } = body;
    if (req["context"]) userD = req["context"].userDetails;
    const roleD = await this.accessControlRepo.getRoleInfoByRole({ role });
    const password = generateRandomPassword();
    if (!roleD) {
      throw DbExecptions.DOESNOT_EXISTS("role");
    }
    const hash = await bcrypt.hash(password, 10);
    const ud = await this.usersRepo.createUser({
      ...rest,
      password: hash,
      roleId: roleD.id,
      createdBy: userD?.id,
      accessToken: "",
    });
    if (body.bookId) {
      this.booksRepo.addUserToBook({
        bookId: body.bookId,
        userId: ud.id,
      });
    }
    ud.password = password;
    return ud;
  }
  @Get("/here")
  async here() {
    return "here";
  }
  @Post("/login")
  async login(@Body() body: { value: string; password: string }) {
    const user = await this.usersRepo.getUserByEmailOrMobile({
      value: body.value,
    });
    if (!user) {
      return CommonExceptions.INVALID_CREDENTIALS("email or mobile");
    }
    if (!bcrypt.compare(user.password, body.password))
      CommonExceptions.INVALID_CREDENTIALS("password");
    const accessToken = await this.authService.generateToken({
      userId: user.id,
    });
    this.usersRepo.updateUser({ accessToken, email: user.email });
    return { ...user, password: "", accessToken };
  }
  @Get("/login/:token")
  async getNewToken(@Param() params: { token: string }) {
    const decoded = await this.authService.verifyToken(params);
    return await this.authService.createTokenForUser({
      userId: decoded["userId"],
    });
  }

  @Post("/list")
  @UseGuards(UserResourceIncludeGuard)
  async list(@Body() body: filterUserI) {
    const { internalAccessPayload } = body;
    if (body.role) {
      const roleId = (
        await this.accessControlRepo.getRoleInfoByRole({ role: body.role })
      ).id;
      body.roleId = roleId;
    }
    try {
      const [list, count] = await Promise.all([
        this.usersRepo.getUsers({
          ...body,
          ...internalAccessPayload,
        }),
        this.usersRepo.getUsersCount({
          ...body,
          ...internalAccessPayload,
        }),
      ]);
      const listRes = await Promise.all(
        list.map((v) => this.usersService.getUserWithImage({ user: v }))
      );
      const res = await Promise.all(
        listRes.map(async (v) => {
          const [role, bkLst] = await Promise.all([
            this.accessControlRepo.getRoleInfoById({
              id: v.roleId,
            }),
            this.booksRepo.getUserBook({ userId: v.id }),
          ]);
          return {
            ...v,
            role: role.role,
            recentBook: bkLst?.[0],
            bookCount: bkLst.length,
          };
        })
      );
      return {
        count,
        list: res,
      };
    } catch (e) {
      throw new MessageError(e);
    }
  }
}
