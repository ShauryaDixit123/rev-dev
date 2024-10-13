import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { BooksRepository } from "../repositories/book.repository";
import { CommonExceptions } from "src/common/constants/status";

@Injectable()
export class BookUserMapIncludeGuard implements CanActivate {
  constructor(private readonly booksRepo: BooksRepository) {}
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
      console.log("herhehrherh1e", bk);
      if (bk) return true;
    }
    console.log("herhehrherhe");
    throw CommonExceptions.ACCESS_NOT_ALLOWED;
  }
}
