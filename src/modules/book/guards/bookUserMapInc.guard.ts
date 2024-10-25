import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { BooksRepository } from "../repositories/book.repository";
import { CommonExceptions } from "src/common/constants/status";
import { GOD__VIEW_ROLES } from "src/modules/user/constants/roles";

@Injectable()
export class BookUserMapIncludeGuard implements CanActivate {
  constructor(
    private readonly logger: Logger,
    private readonly booksRepo: BooksRepository
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const accessPayload = request.headers["accesspayload"]
      ? JSON.parse(request.headers["accesspayload"])
      : undefined;
    const reqContext = request["context"];
    const { userDetails } = reqContext;
    const { _dependencyResource, _dependencyResource_Part } = request.headers;

    console.log(
      "hrhehrhe",
      reqContext,
      _dependencyResource,
      _dependencyResource_Part
    );
    if (
      (_dependencyResource === "bookUserMap" ||
        _dependencyResource === "book") &&
      _dependencyResource_Part === "isIncluded"
    ) {
      const { bookId } = accessPayload;
      const bk = await this.booksRepo.getUserBook({
        userId: userDetails.id,
        bookId,
      });
      this.logger.log("book include", bk);
      if (bk) return true;
    }
    if (GOD__VIEW_ROLES.includes(reqContext["userDetails"]?.roleId)) {
      return true;
    }
    this.logger.log("thrown out!");
    throw CommonExceptions.ACCESS_NOT_ALLOWED;
  }
}
