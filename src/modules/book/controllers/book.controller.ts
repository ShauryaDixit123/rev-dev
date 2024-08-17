import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { BooksRepository } from "../repositories/book.repository";
import {
  addBookStageReqI,
  addManuscriptActivityI,
  createBookI,
  filterBookI,
  updateBookStageI,
} from "../interfaces/book.interface";
import { UserService } from "src/modules/user/services/user.service";
import { BOOK_STAGE_TREE } from "../constants/stage";
import { CommonExceptions } from "src/common/constants/status";
import { BooksService } from "../services/books.service";
import {
  GOD__VIEW_ROLES,
  userRoleInitCount,
} from "src/modules/user/constants/roles";
import { UsersRepository } from "src/modules/user/repositories/user.repository";
import { AccessGuard } from "src/common/guards/access.guard";

@Controller("books")
export class BookController {
  constructor(
    private readonly booksRepo: BooksRepository,
    private readonly usersService: UserService,
    private readonly booksService: BooksService,
    private readonly usersRepo: UsersRepository
  ) {}
  @Post("/add")
  // @UseGuards(AccessGuard)
  addBook(@Body() body: createBookI, @Req() req: Request) {
    const { userDetails } = req["context"];
    const tmp = userRoleInitCount;
    body.bookUsers.forEach(async (buId) => {
      const ud = await this.usersRepo.getUserById({ id: buId });
      tmp[ud.Role.role] = 1;
    });
    Object.keys(tmp).forEach((k) => {
      if (tmp[k] === 0) throw CommonExceptions.MISSING_FIELD(k);
    });
    return this.booksService.createBookWithInitStages({
      ...body,
      createdBy: userDetails.id,
    });
  }

  // filtering based on role required
  @Post("/lookup")
  async list(@Body() body: filterBookI, @Req() req: Request) {
    const { userDetails } = req["context"];
    if (!GOD__VIEW_ROLES.includes(userDetails.roleId)) {
      body.userId = userDetails.id;
    }
    if (body.stage) {
      const stgd = BOOK_STAGE_TREE.find((bk) => bk.stage === body.stage);
      body.stageId = stgd.id;
    }
    const list = await this.booksService.getFilteredBooks({ ...body });
    const count = await this.booksService.getFilteredBooksCount({ ...body });
    const listRes = await Promise.all(
      list.map(async (ls) => {
        const obj = { ...ls };
        const ud = obj["BookUserMap"];
        const stgs = await Promise.all(
          obj["BookStage"].map(async (bkstg) => {
            bkstg.stage = BOOK_STAGE_TREE.find(
              (v) => v.id === bkstg.stageId
            ).stage;
            return bkstg;
          })
        );
        const ump = await Promise.all(
          ud.map(async (u) =>
            this.usersService.prepareUserImageRole({ user: u["User"] })
          )
        );
        obj["BookUserMap"] = ump;
        obj["BookStage"] = stgs;
        return obj;
      })
    );
    return { count, list: listRes };
  }

  @Get("/:id")
  async getBookById(@Param() params: { id: string }) {
    return await this.booksService.getBookWithDraftImage(
      await this.booksRepo.getBookById({ id: params.id })
    );
  }
  // changes for bk stage to book id and stage name
  @Post("/:id/stage/add")
  async addBookStage(@Param("id") id: string, @Body() body: addBookStageReqI) {
    const bkStgs = await this.booksRepo.getBookStages({ bookId: id });
    const stgD = BOOK_STAGE_TREE.find((st) => st.stage === body.stage);
    if (stgD.prevId !== null) {
      stgD.prevId.forEach((st) => {
        const bkStage = bkStgs.find((bkStg) => bkStg.stageId === st);
        if (!bkStage) throw CommonExceptions.INVALID_BOOK_STAGE_REDIRECTION;
      });
    }
    return this.booksRepo.addBookStageDetails({ ...body, stageId: stgD.id });
  }
  @Put("/:id/stage")
  updateBookStage(@Param("id") id: string, @Body() body: updateBookStageI) {
    return this.booksRepo.updateBookStage({ ...body, id });
  }
  @Get("/stage/:id")
  async getBookStageDetails(@Param() params: { id: string }) {
    const bk = await this.booksRepo.getBookStageById({ id: params.id });
  }
  @Get("/:id/stage/all")
  getBookStages(@Param() params: { id: string }) {
    return this.booksRepo.getBookStages({ bookId: params.id });
  }
  @Get("/manuscript/:mid/activity")
  getManuscriptActivities(@Param("id") id: string) {
    return this.booksRepo.getManuscriptActivityById({ mid: id });
  }
  @Post("/manuscript/activity")
  addManuscriptActivity(@Body() body: addManuscriptActivityI) {
    return this.booksRepo.addManuscriptActivity(body);
  }
}
